import { createTigrisHttpClient, getEnvVar } from '@shared/index';
import { describe, expect, it } from 'vitest';
import { createTemporaryCredentials } from './create';

const DEFAULT_STORAGE_ENDPOINT = 'https://t3.storage.dev';

const bucket = getEnvVar('TIGRIS_STORAGE_BUCKET');
const storageEndpoint =
  getEnvVar('TIGRIS_STORAGE_ENDPOINT') || DEFAULT_STORAGE_ENDPOINT;
const hasKey =
  !!getEnvVar('TIGRIS_STORAGE_ACCESS_KEY_ID') &&
  !!getEnvVar('TIGRIS_STORAGE_SECRET_ACCESS_KEY');
// The STS endpoint defaults to production. Against another environment, issue
// from its own STS endpoint or not at all: a production STS would not know the
// key.
const stsMatchesStorage =
  storageEndpoint === DEFAULT_STORAGE_ENDPOINT ||
  !!getEnvVar('TIGRIS_STS_ENDPOINT');

const skip = !bucket || !hasKey || !stsMatchesStorage;
if (skip) {
  console.warn(
    'Skipping temporary credentials integration tests: needs TIGRIS_STORAGE_BUCKET, an access key, and TIGRIS_STS_ENDPOINT when TIGRIS_STORAGE_ENDPOINT is not production'
  );
}

describe.skipIf(skip)('createTemporaryCredentials (integration)', () => {
  it('issues read-only credentials that list the bucket and cannot write', async () => {
    const { data: credentials, error } = await createTemporaryCredentials(
      'sdk-integration',
      { bucket, access: 'read', durationSeconds: 900 }
    );

    expect(error).toBeUndefined();
    expect(credentials?.sessionToken).toBeTruthy();
    expect(credentials!.expiration.getTime()).toBeGreaterThan(Date.now());
    expect(credentials?.federatedUser.arn).toContain(
      'federated-user/sdk-integration'
    );

    const { data: client } = createTigrisHttpClient({
      baseUrl: storageEndpoint,
      accessKeyId: credentials!.accessKeyId,
      secretAccessKey: credentials!.secretAccessKey,
      sessionToken: credentials!.sessionToken,
    });

    const listed = await client!.request({
      method: 'GET',
      path: `/${bucket}`,
      query: { 'list-type': 2, 'max-keys': 1 },
    });
    expect(listed.error).toBeUndefined();

    const written = await client!.request({
      method: 'PUT',
      path: `/${bucket}/temporary-credentials-${Date.now()}.txt`,
      headers: { 'Content-Type': 'text/plain' },
      body: 'should not be written',
    });
    expect(written.status).toBe(403);
  });

  it('reports why the gateway refused a policy', async () => {
    const { error } = await createTemporaryCredentials('sdk-integration', {
      policy: {
        version: '2012-10-17',
        statements: [
          {
            effect: 'Deny',
            action: ['s3:GetObject'],
            resource: `arn:aws:s3:::${bucket}/*`,
          },
        ],
      },
    });

    expect(error?.message).toContain('only Effect Allow is supported');
  });
});
