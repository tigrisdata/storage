import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIAMClient } from './http-client';

let uniqueSuffix = 0;

beforeEach(() => {
  // Empty strings, not deletes: an unset variable falls back to a `.env` file.
  for (const name of [
    'TIGRIS_STORAGE_ACCESS_KEY_ID',
    'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
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

describe('createIAMClient', () => {
  it('sends an OAuth token unsigned even when access keys are in the environment', async () => {
    vi.stubEnv('TIGRIS_STORAGE_ACCESS_KEY_ID', 'tid_env');
    vi.stubEnv('TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tsec_env');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { data, error } = createIAMClient({
      iamEndpoint: `https://iam${uniqueSuffix++}.example.com`,
      sessionToken: 'oauth',
      organizationId: 'org',
    });
    expect(error).toBeUndefined();
    await data!.request({ method: 'GET', path: '/' });

    const headers = Object.fromEntries(
      Object.entries(
        (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
          .headers as Record<string, string>
      ).map(([key, value]) => [key.toLowerCase(), value])
    );
    expect(headers.authorization).toBeUndefined();
    expect(headers['x-amz-security-token']).toBe('oauth');
    expect(headers['x-tigris-namespace']).toBe('org');
  });
});
