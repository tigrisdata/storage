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
import { renewAuth0Session, restoreAuth0Session } from '../src/auth/oauth';

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
  it('forces a refresh and stores the tokens without touching /userinfo', async () => {
    // The SDK returns its cached token until a minute before expiry; the CLI
    // asks five minutes before, so a cache hit would just re-install the
    // token that is about to lapse. And a renewal must not depend on
    // /userinfo: the organizations are already stored, and a blip there
    // mid-upload would otherwise leave the near-expired token in place.
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

    expect(client.getTokenSilently).toHaveBeenLastCalledWith(
      expect.objectContaining({ cacheMode: 'off', detailedResponse: true })
    );
    expect(getSessionState()).toEqual({
      method: 'oauth',
      organizationId: 'org_1',
    });
    expect((await getSessionConfig()).sessionToken).toBe('renewed-access');
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
      /Login required/
    );
    expect(client.logout).toHaveBeenCalledWith({ openUrl: false });
  });
});
