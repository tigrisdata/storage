import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { mergeFork, rebaseFork } from '../lib/bucket/forks';
import { removeBucket } from '../lib/bucket/remove';
import { createBucketSnapshot } from '../lib/bucket/snapshot';
import { config } from '../lib/config';
import { get } from '../lib/object/get';
import { put } from '../lib/object/put';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

// Target a specific bucket (a source or one of its forks) by overriding the
// bucket on the shared config.
const bucketConfig = (bucket: string) => ({ ...config, bucket });

// Bucket creation and fork relationships are eventually consistent; give the
// gateway a moment before exercising merge/rebase against a fresh fork.
const waitForConsistency = (ms = 10_000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(skipTests)('mergeFork integration', () => {
  const ts = Date.now();
  const sourceBucket = `test-merge-src-${ts}`.toLowerCase();
  const forkBucket = `test-merge-fork-${ts}`.toLowerCase();
  const snapshotForkBucket = `test-merge-fork-snap-${ts}`.toLowerCase();
  const bucketsToCleanup: string[] = [];

  beforeAll(async () => {
    const src = await createBucket(sourceBucket, {
      enableSnapshot: true,
      config,
    });
    expect(
      src.error,
      `source bucket create failed: ${src.error?.message}`
    ).toBeUndefined();
    bucketsToCleanup.push(sourceBucket);

    // Seed the source with an object that exists before either fork is made.
    const seed = await put('base.txt', 'base', {
      config: bucketConfig(sourceBucket),
    });
    expect(seed.error).toBeUndefined();

    const fork = await createBucket(forkBucket, {
      sourceBucketName: sourceBucket,
      config,
    });
    expect(
      fork.error,
      `fork create failed: ${fork.error?.message}`
    ).toBeUndefined();
    bucketsToCleanup.push(forkBucket);

    const snapFork = await createBucket(snapshotForkBucket, {
      sourceBucketName: sourceBucket,
      config,
    });
    expect(snapFork.error).toBeUndefined();
    bucketsToCleanup.push(snapshotForkBucket);

    await waitForConsistency();
  }, 60_000);

  afterAll(async () => {
    // Remove forks before the parent so the source bucket can be deleted.
    const order = [forkBucket, snapshotForkBucket, sourceBucket].filter((b) =>
      bucketsToCleanup.includes(b)
    );
    for (const bucket of order) {
      await removeBucket(bucket, { force: true, config });
    }
  });

  it('merges a fork back into its source and returns a snapshot version', async () => {
    // A change made on the fork after it diverged from the source.
    const change = await put('fork-only.txt', 'made in fork', {
      config: bucketConfig(forkBucket),
    });
    expect(change.error).toBeUndefined();

    const result = await mergeFork(forkBucket, sourceBucket, { config });

    expect(
      result.error,
      `merge failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data).toBeDefined();
    // The gateway reports the resulting snapshot via response header.
    expect(typeof result.data?.snapshotVersion).toBe('string');
    expect(result.data?.snapshotVersion).not.toBe('');

    // The fork's object should now be present in the source bucket.
    await waitForConsistency(5_000);
    const merged = await get('fork-only.txt', 'string', {
      config: bucketConfig(sourceBucket),
    });
    expect(merged.error).toBeUndefined();
    expect(merged.data).toBe('made in fork');
  }, 60_000);

  it('merges from a specific fork snapshot', async () => {
    const change = await put('snap-fork-only.txt', 'snapshot content', {
      config: bucketConfig(snapshotForkBucket),
    });
    expect(change.error).toBeUndefined();

    // The optional snapshot scopes the merge to a snapshot of the *fork*
    // (the merge source), not of the parent bucket.
    const snap = await createBucketSnapshot(snapshotForkBucket, { config });
    expect(snap.error).toBeUndefined();
    const version = snap.data?.snapshotVersion as string;
    expect(version).toBeTruthy();

    const result = await mergeFork(snapshotForkBucket, sourceBucket, {
      forkSnapshot: version,
      config,
    });

    expect(
      result.error,
      `snapshot merge failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data?.snapshotVersion).not.toBe('');
  }, 60_000);

  // ── Validation errors (no network) ──

  it('returns an error when forkName is missing', async () => {
    const result = await mergeFork('', sourceBucket, { config });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe(
      'Fork name and source bucket name are required'
    );
  });

  it('returns an error when sourceBucketName is missing', async () => {
    const result = await mergeFork(forkBucket, '', { config });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe(
      'Fork name and source bucket name are required'
    );
  });

  it('returns an error when the merge source is not a fork of the target', async () => {
    // Two unrelated buckets — neither is a fork of the other.
    const result = await mergeFork(sourceBucket, forkBucket, { config });
    expect(result.error).toBeDefined();
  }, 30_000);
});

describe.skipIf(skipTests)('rebaseFork integration', () => {
  const ts = Date.now();
  const sourceBucket = `test-rebase-src-${ts}`.toLowerCase();
  const forkBucket = `test-rebase-fork-${ts}`.toLowerCase();
  const bucketsToCleanup: string[] = [];

  beforeAll(async () => {
    const src = await createBucket(sourceBucket, {
      enableSnapshot: true,
      config,
    });
    expect(src.error).toBeUndefined();
    bucketsToCleanup.push(sourceBucket);

    const seed = await put('base.txt', 'base', {
      config: bucketConfig(sourceBucket),
    });
    expect(seed.error).toBeUndefined();

    const fork = await createBucket(forkBucket, {
      sourceBucketName: sourceBucket,
      config,
    });
    expect(fork.error).toBeUndefined();
    bucketsToCleanup.push(forkBucket);

    await waitForConsistency();
  }, 60_000);

  afterAll(async () => {
    const order = [forkBucket, sourceBucket].filter((b) =>
      bucketsToCleanup.includes(b)
    );
    for (const bucket of order) {
      await removeBucket(bucket, { force: true, config });
    }
  });

  it('rebases a fork onto its source and returns a snapshot version', async () => {
    // Advance the source after the fork was created.
    const change = await put('rebased.txt', 'from source', {
      config: bucketConfig(sourceBucket),
    });
    expect(change.error).toBeUndefined();

    const result = await rebaseFork(forkBucket, { config });

    expect(
      result.error,
      `rebase failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(typeof result.data?.snapshotVersion).toBe('string');
    expect(result.data?.snapshotVersion).not.toBe('');

    // The source's new object should now be visible in the rebased fork.
    await waitForConsistency(5_000);
    const rebased = await get('rebased.txt', 'string', {
      config: bucketConfig(forkBucket),
    });
    expect(rebased.error).toBeUndefined();
    expect(rebased.data).toBe('from source');
  }, 60_000);

  it('returns an error when forkName is missing', async () => {
    const result = await rebaseFork('', { config });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Fork name is required');
  });
});
