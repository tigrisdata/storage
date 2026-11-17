import { afterEach, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { getBucketInfo } from '../lib/bucket/info';
import { listBuckets } from '../lib/bucket/list';
import { removeBucket } from '../lib/bucket/remove';
import { getConfig } from '../lib/config';
import { list } from '../lib/object/list';
import { put } from '../lib/object/put';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const config = getConfig();

const testBucket = (suffix: string) =>
  `test-create-${suffix}-${Date.now()}`.toLowerCase();

describe.skipIf(skipTests)('createBucket Integration Tests', () => {
  const bucketsToCleanup: string[] = [];

  // allowObjectAcl is applied with a follow-up updateBucket PATCH after the
  // bucket is created, so round-trip assertions poll getBucketInfo until the
  // change propagates rather than reading once.
  const POLL = { timeout: 15000, interval: 1000 };

  afterEach(async () => {
    // Delete in reverse (LIFO): a fork is pushed after its source bucket, and a
    // source cannot be removed while a dependent fork still exists — deleting
    // source-first fails and leaks the source.
    for (const bucket of [...bucketsToCleanup].reverse()) {
      await removeBucket(bucket, { force: true, config });
    }
    bucketsToCleanup.length = 0;
  });

  it('should create a bucket and be listable', async () => {
    const name = testBucket('basic');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, { config });

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.hasForks).toBe(false);
    expect(result.data?.isSnapshotEnabled).toBe(false);

    const { data } = await listBuckets({ config });
    expect(data?.buckets.some((b) => b.name === name)).toBe(true);
  });

  it('should create a public bucket with directory listing disabled', async () => {
    const name = testBucket('public');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, {
      access: 'public',
      config,
    });

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();

    // Verify directory listing is disabled: unauthenticated ListObjects
    // should return 403 even though the bucket is public
    const endpoint = config.endpoint || 'https://t3.storage.dev';
    const resp = await fetch(`${endpoint}/${name}?list-type=2`);
    expect(resp.status).toBe(403);
  });

  it('should create a bucket with snapshot enabled', async () => {
    const name = testBucket('snap');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, {
      enableSnapshot: true,
      config,
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.isSnapshotEnabled).toBe(true);
  });

  it('should create a fork from a source bucket', async () => {
    const sourceName = testBucket('fork-src');
    const forkName = testBucket('fork-dst');
    bucketsToCleanup.push(sourceName, forkName);

    await createBucket(sourceName, {
      enableSnapshot: true,
      config,
    });

    const result = await createBucket(forkName, {
      sourceBucketName: sourceName,
      config,
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.sourceBucketName).toBe(sourceName);
  });

  it('should accept all location types', async () => {
    const locations = [
      {
        suffix: 'single',
        opts: { type: 'single' as const, values: 'iad' as const },
      },
      {
        suffix: 'multi',
        opts: { type: 'multi' as const, values: 'usa' as const },
      },
      {
        suffix: 'dual',
        opts: {
          type: 'dual' as const,
          values: ['iad', 'fra'] as ['iad', 'fra'],
        },
      },
      { suffix: 'global', opts: { type: 'global' as const } },
    ];

    for (const { suffix, opts } of locations) {
      const name = testBucket(`loc-${suffix}`);
      bucketsToCleanup.push(name);

      const result = await createBucket(name, {
        locations: opts,
        config,
      });

      expect(result.error, `${suffix} location failed`).toBeUndefined();
      expect(result.data).toBeDefined();
    }
  });

  it('should create a bucket with all options combined', async () => {
    const name = testBucket('combined');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, {
      access: 'public',
      defaultTier: 'STANDARD_IA',
      enableSnapshot: true,
      locations: { type: 'single', values: 'iad' },
      config,
    });

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.isSnapshotEnabled).toBe(true);
  });

  // ── Object ACL ──

  it('should create a bucket with object ACL allowed and round-trip via getBucketInfo', async () => {
    const name = testBucket('acl');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, {
      allowObjectAcl: true,
      config,
    });

    expect(
      result.error,
      `create with allowObjectAcl failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data).toBeDefined();

    await expect
      .poll(async () => {
        const info = await getBucketInfo(name, { config });
        return info.data?.settings.allowObjectAcl;
      }, POLL)
      .toBe(true);
  });

  it.each([7, 30])(
    'should create a bucket with soft delete enabled for %s days',
    async (retentionDays) => {
      const name = testBucket(`soft-delete-${retentionDays}`);
      bucketsToCleanup.push(name);

      const result = await createBucket(name, {
        softDelete: { enabled: true, retentionDays },
        config,
      });

      expect(
        result.error,
        `create with softDelete failed: ${result.error?.message}`
      ).toBeUndefined();
      expect(result.data).toBeDefined();

      await expect
        .poll(async () => {
          const info = await getBucketInfo(name, { config });
          return info.data?.settings.softDelete;
        }, POLL)
        .toEqual({ enabled: true, retentionDays });
    }
  );

  it('should reject an out-of-range soft delete retention without creating the bucket', async () => {
    const name = testBucket('soft-delete-bad');

    const result = await createBucket(name, {
      softDelete: { enabled: true, retentionDays: 3 },
      config,
    });

    expect(result.error?.message).toContain('between 7 and 90');

    // Look the bucket up by name rather than scanning a listing, which is
    // paginated and could hide an unwanted bucket on a later page.
    const info = await getBucketInfo(name, { config });
    expect(info.error).toBeDefined();
    expect(info.data).toBeUndefined();
  });

  it('should default object ACL to disabled when allowObjectAcl is omitted', async () => {
    const name = testBucket('no-acl');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, { config });
    expect(result.error).toBeUndefined();

    const info = await getBucketInfo(name, { config });
    expect(info.error).toBeUndefined();
    expect(info.data?.settings.allowObjectAcl).toBe(false);
  });

  it('should create a bucket with global user metadata and list it', async () => {
    const name = testBucket('global-meta');
    bucketsToCleanup.push(name);

    const result = await createBucket(name, {
      enableGlobalUserMetadata: true,
      config,
    });
    expect(
      result.error,
      `create with enableGlobalUserMetadata failed: ${result.error?.message}`
    ).toBeUndefined();

    const bucketConfig = { ...config, bucket: name };

    const withMeta = await put('folder/with meta.txt', 'hello', {
      metadata: { owner: 'alice', mode: '33188' },
      config: bucketConfig,
    });
    expect(withMeta.error).toBeUndefined();
    const plain = await put('plain.txt', 'hello', { config: bucketConfig });
    expect(plain.error).toBeUndefined();

    await expect
      .poll(async () => {
        const { data } = await list({
          includeMetadata: true,
          config: bucketConfig,
        });
        return Object.fromEntries(
          (data?.items ?? []).map((item) => [item.name, item.metadata])
        );
      }, POLL)
      .toEqual({
        'folder/with meta.txt': { owner: 'alice', mode: '33188' },
        'plain.txt': {},
      });

    // A plain listing carries no metadata field at all.
    const { data } = await list({ config: bucketConfig });
    expect(data?.items.every((item) => item.metadata === undefined)).toBe(true);
  });

  // ── Validation errors ──

  it('should return error for invalid location', async () => {
    const result = await createBucket(testBucket('bad-loc'), {
      locations: { type: 'single', values: 'invalid' as 'iad' },
      config,
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Invalid single-region location');
  });

  it('should return error when sourceBucketSnapshot is provided without sourceBucketName', async () => {
    const result = await createBucket(testBucket('snap-no-src'), {
      sourceBucketSnapshot: 'snap-123',
      config,
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe(
      'sourceBucketName is required when sourceBucketSnapshot is provided'
    );
  });
});
