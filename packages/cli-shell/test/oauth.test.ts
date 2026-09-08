import { afterEach, describe, expect, it, vi } from 'vitest';

const createAuth0Client = vi.fn();

vi.mock('@auth0/auth0-spa-js', () => ({
  createAuth0Client: (...args: unknown[]) => createAuth0Client(...args),
  GenericError: class GenericError extends Error {
    constructor(
      public error: string,
      public error_description: string
    ) {
      super(error_description);
    }
  },
}));

import { GenericError } from '@auth0/auth0-spa-js';
import { getSessionConfig, getSessionState } from '@tigrisdata/cli/browser';
import {
  expiryOf,
  renewAuth0Session,
  restoreAuth0Session,
} from '../src/auth/oauth';

// Distinct tenants per test, so the module-level client cache starts empty.
let tenant = 0;
function options() {
  tenant++;
  return { domain: `tenant-${tenant}.example`, clientId: `client-${tenant}` };
}

afterEach(() => {
  createAuth0Client.mockReset();
  vi.unstubAllGlobals();
});

/** /userinfo with one organization under the Tigris claims namespace. */
function stubUserinfo() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            'https://tigris': { ns: [{ id: 'org_1', name: 'Acme' }] },
          })
        )
    )
  );
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: async () => true,
    getTokenSilently: vi.fn(async () => ({
      access_token: 'fresh-access',
      id_token: 'fresh-id',
      expires_in: 3600,
    })),
    getUser: async () => ({ email: 'dev@example.com' }),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
}

/** A JWT-shaped token whose only claim is `exp` (given here in Unix ms). */
function jwt(expiresAtMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `h.${payload}.s`;
}

describe('auth0 client cache', () => {
  it('reuses a client that initialised', async () => {
    createAuth0Client.mockResolvedValue({ isAuthenticated: async () => false });
    const auth = options();

    await restoreAuth0Session(auth);
    await restoreAuth0Session(auth);

    expect(createAuth0Client).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed initialisation', async () => {
    // Regression: the rejected promise stayed cached, so one offline OpenID
    // discovery failure poisoned login, restore and renew until a reload.
    createAuth0Client
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ isAuthenticated: async () => false });
    const auth = options();

    expect(await restoreAuth0Session(auth)).toBe(false);
    expect(await restoreAuth0Session(auth)).toBe(false);

    expect(createAuth0Client).toHaveBeenCalledTimes(2);
  });
});

describe('renewAuth0Session', () => {
  it('renews and stores the tokens without touching /userinfo', async () => {
    // A renewal must not depend on /userinfo: the organizations are already
    // stored, and a blip there mid-upload must not leave the near-expired
    // token in place.
    const client = fakeClient({
      getTokenSilently: vi
        .fn()
        .mockResolvedValueOnce({
          access_token: 'first-access',
          id_token: 'id',
          expires_in: 3600,
        })
        // No id_token on the refresh, as Auth0 sometimes answers.
        .mockResolvedValueOnce({
          access_token: 'renewed-access',
          expires_in: 3600,
        }),
    });
    createAuth0Client.mockResolvedValue(client);
    const auth = options();

    stubUserinfo();
    expect(await restoreAuth0Session(auth)).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    );
    await renewAuth0Session(auth);

    expect(getSessionState()).toEqual({
      method: 'oauth',
      organizationId: 'org_1',
    });
    expect((await getSessionConfig()).sessionToken).toBe('renewed-access');
  });

  it('forces a real refresh when a refresh token is available', async () => {
    // The CLI asks to renew five minutes before expiry, and a cache hit
    // reports the token's original expires_in — so renewal must force a real
    // refresh to record a correct lifetime and hand back a fresh token.
    const client = fakeClient({
      getTokenSilently: vi
        .fn()
        .mockResolvedValueOnce({
          access_token: 'at-restore',
          id_token: 'id',
          expires_in: 3600,
        })
        .mockResolvedValueOnce({
          access_token: 'at-renew',
          id_token: 'id',
          expires_in: 3600,
        }),
    });
    createAuth0Client.mockResolvedValue(client);
    const auth = options();

    stubUserinfo();
    expect(await restoreAuth0Session(auth)).toBe(true);
    await renewAuth0Session(auth);

    const calls = client.getTokenSilently.mock.calls as unknown as Array<
      [{ cacheMode?: string; detailedResponse?: boolean }]
    >;
    // Restore is a plain read; only the renewal forces.
    expect(calls[0]?.[0]).toMatchObject({ cacheMode: 'on' });
    expect(calls.at(-1)?.[0]).toMatchObject({
      cacheMode: 'off',
      detailedResponse: true,
    });
    expect((await getSessionConfig()).sessionToken).toBe('at-renew');
  });

  it('uses the cached token when the session has no refresh token', async () => {
    // A session cached before offline access has a valid access token but no
    // refresh token: the forced grant fails, and the cached token must still
    // serve so the command runs instead of failing outright.
    const client = fakeClient({
      getTokenSilently: vi
        .fn()
        .mockResolvedValueOnce({
          access_token: 'at-restore',
          id_token: 'id',
          expires_in: 3600,
        })
        .mockRejectedValueOnce(
          new GenericError('missing_refresh_token', 'Missing Refresh Token')
        )
        .mockResolvedValueOnce({
          access_token: 'cached',
          id_token: 'id',
          expires_in: 3600,
        }),
    });
    createAuth0Client.mockResolvedValue(client);
    const auth = options();

    stubUserinfo();
    expect(await restoreAuth0Session(auth)).toBe(true);
    await renewAuth0Session(auth); // must not throw

    const modes = (
      client.getTokenSilently.mock.calls as unknown as Array<
        [{ cacheMode?: string }]
      >
    )
      .slice(1)
      .map((call) => call[0]?.cacheMode);
    expect(modes).toEqual(['off', 'on']);
    expect((await getSessionConfig()).sessionToken).toBe('cached');
  });

  it("records the cached token's real expiry, not a fresh lifetime", async () => {
    // Regression: the cached fallback carried the SDK's original expires_in,
    // so a token minutes from death was stored as good for another hour and
    // the CLI stopped refreshing until it 401'd. Expiry must come from the
    // token itself.
    const now = Date.now();
    const client = fakeClient({
      getTokenSilently: vi
        .fn()
        .mockResolvedValueOnce({
          access_token: jwt(now + 60 * 60 * 1000),
          id_token: 'id',
          expires_in: 3600,
        })
        .mockRejectedValueOnce(
          new GenericError('missing_refresh_token', 'Missing Refresh Token')
        )
        .mockResolvedValueOnce({
          // The same cached token: two minutes left, yet expires_in still
          // reports the original hour.
          access_token: jwt(now + 2 * 60 * 1000),
          id_token: 'id',
          expires_in: 3600,
        }),
    });
    createAuth0Client.mockResolvedValue(client);
    const auth = options();

    stubUserinfo();
    expect(await restoreAuth0Session(auth)).toBe(true);
    // A fresh hour: the CLI hands the token out without wanting a refresh.
    await expect(getSessionConfig()).resolves.toBeDefined();

    await renewAuth0Session(auth);

    // Two minutes is inside the CLI's five-minute window, so it asks to
    // refresh again — proof the near expiry was recorded, not an hour. No
    // host is installed here, so that refresh has nothing to call and fails.
    await expect(getSessionConfig()).rejects.toThrow(/refresh token/i);
  });

  it('fails plainly when there is no session to renew', async () => {
    createAuth0Client.mockResolvedValue(
      fakeClient({ isAuthenticated: async () => false })
    );

    await expect(renewAuth0Session(options())).rejects.toThrow(
      /Not authenticated/
    );
  });

  it('discards a session the tenant no longer honours', async () => {
    const client = fakeClient({
      getTokenSilently: vi.fn(async () => {
        throw new GenericError('login_required', 'Login required');
      }),
    });
    createAuth0Client.mockResolvedValue(client);

    await expect(renewAuth0Session(options())).rejects.toThrow(
      /run "tigris login"/i
    );
    expect(client.logout).toHaveBeenCalledWith({ openUrl: false });
    // A refresh token the tenant rejects is a dead session: no cached
    // fallback, which would silently reinstall it.
    expect(client.getTokenSilently).toHaveBeenCalledTimes(1);
  });

  it('never leaks the tenant audience or scope into the error', async () => {
    // What the user actually saw: the SDK's raw "Missing Refresh Token
    // (audience: ..., scope: ...)" plus tenant-config advice, straight to a
    // shell. The message must be clean and actionable instead.
    const client = fakeClient({
      getTokenSilently: vi.fn(async () => {
        throw new GenericError(
          'missing_refresh_token',
          "Missing Refresh Token (audience: 'https://tigris-os-api', scope: 'openid profile email offline_access')"
        );
      }),
    });
    createAuth0Client.mockResolvedValue(client);

    const error = (await renewAuth0Session(options()).catch((e) => e)) as Error;

    expect(error.message).toBe(
      'Your Tigris session has expired. Run "tigris login" to sign in again.'
    );
    expect(error.message).not.toMatch(/audience|scope|offline_access/i);
  });
});

describe('expiryOf', () => {
  it('reads exp from a JWT, exact to the second', () => {
    const at = Date.now() + 123_000;
    expect(expiryOf(jwt(at), 3600)).toBe(Math.floor(at / 1000) * 1000);
  });

  it('falls back to expires_in for an opaque token', () => {
    const before = Date.now();
    const expiry = expiryOf('opaque-token', 60);
    expect(expiry).toBeGreaterThanOrEqual(before + 60_000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it('is undefined with neither', () => {
    expect(expiryOf('opaque-token', undefined)).toBeUndefined();
  });

  it('survives a malformed payload', () => {
    expect(expiryOf('h.%%%not-base64%%%.s', 60)).toBeDefined();
  });
});
