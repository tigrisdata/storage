import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { temporarySessionToken } from './config';
import { createStorageClient } from './http-client';
import { createTigrisClient } from './tigris-client';

const NAMESPACE_MIDDLEWARE = 'x-Tigris-Namespace-Middleware';

let uniqueSuffix = 0;
/** Clients are cached by endpoint and credentials; give each test its own. */
const endpoint = () => `https://t${uniqueSuffix++}.example.com`;

beforeEach(() => {
  // Empty strings, not deletes: an unset variable falls back to a `.env` file.
  for (const name of [
    'TIGRIS_STORAGE_ACCESS_KEY_ID',
    'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
    'TIGRIS_STORAGE_SESSION_TOKEN',
    'TIGRIS_SESSION_TOKEN',
    'TIGRIS_ORGANIZATION_ID',
  ]) {
    vi.stubEnv(name, '');
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('temporarySessionToken', () => {
  it('takes a session token passed with its key pair', () => {
    expect(
      temporarySessionToken({
        accessKeyId: 'tsid_a',
        secretAccessKey: 'tssec_a',
        sessionToken: 'tsts1-a',
      })
    ).toBe('tsts1-a');
  });

  it('treats a session token without a key pair as OAuth', () => {
    expect(
      temporarySessionToken({ sessionToken: 'oauth', organizationId: 'org' })
    ).toBeUndefined();
  });

  it('treats a session token with empty keys as OAuth, as the CLI passes it', () => {
    expect(
      temporarySessionToken({
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: 'oauth',
        organizationId: 'org',
      })
    ).toBeUndefined();
  });

  it('reads TIGRIS_STORAGE_SESSION_TOKEN for keys from the environment', () => {
    vi.stubEnv('TIGRIS_STORAGE_ACCESS_KEY_ID', 'tsid_env');
    vi.stubEnv('TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tssec_env');
    vi.stubEnv('TIGRIS_STORAGE_SESSION_TOKEN', 'tsts1-env');
    expect(temporarySessionToken()).toBe('tsts1-env');
    expect(temporarySessionToken({ bucket: 'b' })).toBe('tsts1-env');
  });

  it('ignores an environment token without its key pair', () => {
    vi.stubEnv('TIGRIS_STORAGE_SESSION_TOKEN', 'tsts1-env');
    expect(temporarySessionToken()).toBeUndefined();

    vi.stubEnv('TIGRIS_STORAGE_ACCESS_KEY_ID', 'tsid_env');
    expect(temporarySessionToken()).toBeUndefined();
  });

  it('does not pair the environment token with keys passed in options', () => {
    vi.stubEnv('TIGRIS_STORAGE_SESSION_TOKEN', 'tsts1-env');
    expect(
      temporarySessionToken({ accessKeyId: 'tid_a', secretAccessKey: 'tsec_a' })
    ).toBeUndefined();
  });

  it('lets an OAuth token in options win over the environment token', () => {
    vi.stubEnv('TIGRIS_STORAGE_SESSION_TOKEN', 'tsts1-env');
    expect(
      temporarySessionToken({ sessionToken: 'oauth', organizationId: 'org' })
    ).toBeUndefined();
  });
});

describe('createTigrisClient', () => {
  it('signs with the session token of temporary credentials', async () => {
    const { data, error } = createTigrisClient({
      endpoint: endpoint(),
      bucket: 'b',
      accessKeyId: 'tsid_a',
      secretAccessKey: 'tssec_a',
      sessionToken: 'tsts1-a',
    });

    expect(error).toBeUndefined();
    const credentials = await data!.config.credentials();
    expect(credentials).toMatchObject({
      accessKeyId: 'tsid_a',
      secretAccessKey: 'tssec_a',
      sessionToken: 'tsts1-a',
    });
  });

  it('does not add the OAuth namespace header to temporary credentials', () => {
    const { data } = createTigrisClient({
      endpoint: endpoint(),
      bucket: 'b',
      accessKeyId: 'tsid_a',
      secretAccessKey: 'tssec_a',
      sessionToken: 'tsts1-a',
      organizationId: 'org',
    });

    expect(data!.middlewareStack.identify().join()).not.toContain(
      NAMESPACE_MIDDLEWARE
    );
  });

  it('picks up temporary credentials from the environment', async () => {
    vi.stubEnv('TIGRIS_STORAGE_ACCESS_KEY_ID', 'tsid_env');
    vi.stubEnv('TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tssec_env');
    vi.stubEnv('TIGRIS_STORAGE_SESSION_TOKEN', 'tsts1-env');

    const { data, error } = createTigrisClient({
      endpoint: endpoint(),
      bucket: 'b',
    });

    expect(error).toBeUndefined();
    expect(await data!.config.credentials()).toMatchObject({
      accessKeyId: 'tsid_env',
      sessionToken: 'tsts1-env',
    });
  });

  it('builds a new client when the session token changes', async () => {
    const shared = { endpoint: endpoint(), bucket: 'b' };
    const keys = { accessKeyId: 'tsid_a', secretAccessKey: 'tssec_a' };

    const first = createTigrisClient({
      ...shared,
      ...keys,
      sessionToken: 'tsts1-1',
    });
    const second = createTigrisClient({
      ...shared,
      ...keys,
      sessionToken: 'tsts1-2',
    });

    expect(second.data).not.toBe(first.data);
    expect((await second.data!.config.credentials()).sessionToken).toBe(
      'tsts1-2'
    );
  });

  it('keeps OAuth as before: namespace header, no keys required', async () => {
    const { data, error } = createTigrisClient({
      endpoint: endpoint(),
      bucket: 'b',
      sessionToken: 'oauth',
      organizationId: 'org',
    });

    expect(error).toBeUndefined();
    expect(data!.middlewareStack.identify().join()).toContain(
      NAMESPACE_MIDDLEWARE
    );
    expect((await data!.config.credentials()).sessionToken).toBe('oauth');
  });

  it('accepts a credential provider without an organization', async () => {
    const credentialProvider = async () => ({
      accessKeyId: 'tsid_p',
      secretAccessKey: 'tssec_p',
      sessionToken: 'tsts1-p',
    });

    const { data, error } = createTigrisClient({
      endpoint: endpoint(),
      bucket: 'b',
      credentialProvider,
    });

    expect(error).toBeUndefined();
    expect(data!.middlewareStack.identify().join()).not.toContain(
      NAMESPACE_MIDDLEWARE
    );
    expect((await data!.config.credentials()).sessionToken).toBe('tsts1-p');
  });
});

describe('createStorageClient', () => {
  function captureHeaders(): Promise<Record<string, string>> {
    return new Promise((resolve) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          resolve(
            Object.fromEntries(
              Object.entries(init.headers as Record<string, string>).map(
                ([key, value]) => [key.toLowerCase(), value]
              )
            )
          );
          return new Response('{}', { status: 200 });
        })
      );
    });
  }

  it('signs temporary credentials instead of asking for an organization', async () => {
    const headers = captureHeaders();
    const { data, error } = createStorageClient({
      endpoint: endpoint(),
      accessKeyId: 'tsid_a',
      secretAccessKey: 'tssec_a',
      sessionToken: 'tsts1-a',
    });

    expect(error).toBeUndefined();
    await data!.request({ method: 'GET', path: '/b/k' });

    const sent = await headers;
    expect(sent.authorization).toContain('x-amz-security-token');
    expect(sent['x-amz-security-token']).toBe('tsts1-a');
  });

  it('uses OAuth from the environment despite a leftover session token', async () => {
    vi.stubEnv('TIGRIS_STORAGE_SESSION_TOKEN', 'tsts1-stale');
    vi.stubEnv('TIGRIS_SESSION_TOKEN', 'oauth-env');
    vi.stubEnv('TIGRIS_ORGANIZATION_ID', 'org-env');

    const headers = captureHeaders();
    const { data, error } = createStorageClient({ endpoint: endpoint() });
    expect(error).toBeUndefined();
    await data!.request({ method: 'GET', path: '/b/k' });

    const sent = await headers;
    expect(sent.authorization).toBeUndefined();
    expect(sent['x-amz-security-token']).toBe('oauth-env');
    expect(sent['x-tigris-namespace']).toBe('org-env');
  });

  it('keeps OAuth ahead of environment keys, as before', async () => {
    vi.stubEnv('TIGRIS_STORAGE_ACCESS_KEY_ID', 'tid_env');
    vi.stubEnv('TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tsec_env');

    const headers = captureHeaders();
    const { data } = createStorageClient({
      endpoint: endpoint(),
      sessionToken: 'oauth',
      organizationId: 'org',
    });
    await data!.request({ method: 'GET', path: '/b/k' });

    const sent = await headers;
    expect(sent.authorization).toBeUndefined();
    expect(sent['x-amz-security-token']).toBe('oauth');
    expect(sent['x-tigris-namespace']).toBe('org');
  });
});
