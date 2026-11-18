import { S3Client } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../tigris-client', () => ({
  createTigrisClient: vi.fn(),
}));

vi.mock('./update', () => ({
  updateBucket: vi.fn(),
}));

import { createTigrisClient } from '../tigris-client';
import { createBucket } from './create';
import { updateBucket } from './update';

const GLOBAL_USER_METADATA = 'X-Tigris-Global-User-Metadata';

/** Headers of the CreateBucket request the call under test sent. */
let sentHeaders: Record<string, string> | undefined;

beforeEach(() => {
  sentHeaders = undefined;

  // A real S3 client with only the network swapped out, so the assertion is on
  // the request exactly as the command's middleware built it.
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://t3.storage.dev',
    credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
    requestHandler: {
      handle: async (request: { headers: Record<string, string> }) => {
        sentHeaders = request.headers;
        return { response: { statusCode: 200, headers: {} } };
      },
    } as never,
  });

  vi.mocked(createTigrisClient).mockReturnValue({ data: client });
  vi.mocked(updateBucket).mockReset();
  vi.mocked(updateBucket).mockResolvedValue({
    data: { bucket: 'my-bucket', updated: true },
  });
});

// The setting is fixed when the bucket is created, so a CreateBucket that
// silently stops sending the header leaves users with buckets they cannot fix.
// The live-gateway test cannot catch that: a metadata listing inside the
// bucket's own location works with or without the option.
describe('createBucket global user metadata header', () => {
  it('sends the header when enabled', async () => {
    const result = await createBucket('my-bucket', {
      enableGlobalUserMetadata: true,
    });

    expect(result.error).toBeUndefined();
    expect(sentHeaders?.[GLOBAL_USER_METADATA]).toBe('true');
  });

  it.each([
    ['disabled', { enableGlobalUserMetadata: false }],
    ['omitted', {}],
    ['no options are passed', undefined],
  ])('does not send the header when %s', async (_label, options) => {
    const result = await createBucket('my-bucket', options);

    expect(result.error).toBeUndefined();
    expect(sentHeaders).toBeDefined();
    expect(
      Object.keys(sentHeaders ?? {}).map((name) => name.toLowerCase())
    ).not.toContain(GLOBAL_USER_METADATA.toLowerCase());
  });
});

describe('createBucket soft delete', () => {
  const SOFT_DELETE = 'X-Tigris-Soft-Delete';

  it.each([7, 30, 90])(
    'sends the retention period of %s days on the create request',
    async (retentionDays) => {
      const result = await createBucket('my-bucket', {
        softDelete: { enabled: true, retentionDays },
      });

      expect(result.error).toBeUndefined();
      expect(sentHeaders?.[SOFT_DELETE]).toBe(String(retentionDays));
      // Set atomically with creation — no follow-up request.
      expect(updateBucket).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['disabled', { softDelete: { enabled: false } as const }],
    ['omitted', {}],
  ])('does not send the header when %s', async (_label, options) => {
    const result = await createBucket('my-bucket', options);

    expect(result.error).toBeUndefined();
    expect(sentHeaders).toBeDefined();
    expect(
      Object.keys(sentHeaders ?? {}).map((name) => name.toLowerCase())
    ).not.toContain(SOFT_DELETE.toLowerCase());
  });

  it.each([6, 91, 0, -1, 7.5, Number.NaN])(
    'rejects retentionDays %s without sending a request',
    async (retentionDays) => {
      const result = await createBucket('my-bucket', {
        softDelete: { enabled: true, retentionDays },
      });

      expect(result.error?.message).toBe(
        'softDelete.retentionDays must be a whole number between 7 and 90'
      );
      expect(sentHeaders).toBeUndefined();
    }
  );
});
