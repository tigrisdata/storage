import { afterAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { getBucketInfo } from '../lib/bucket/info';
import { removeBucket } from '../lib/bucket/remove';
import {
  BucketTypes,
  disableSnapshot,
  enableSnapshot,
  setBucketType,
} from '../lib/bucket/set/type';
import { getConfig } from '../lib/config';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const config = getConfig();

const testBucket = (suffix: string) =>
  `test-snap-${suffix}-${Date.now()}`.toLowerCase();

// Bucket type changes (and fork relationships) are eventually consistent, so
// assertions poll getBucketInfo rather than reading once.
const POLL = { timeout: 20_000, interval: 1000 };

const isSnapshotEnabled = async (bucket: string) =>
  (await getBucketInfo(bucket, { config })).data?.isSnapshotEnabled;

describe.skipIf(skipTests)('setBucketType / enable-disable snapshot', () => {
  const buckets: string[] = [];
  const forks: string[] = [];

  afterAll(async () => {
    // Remove forks before their parents so the parent can be deleted.
    for (const fork of forks) {
      await removeBucket(fork, { force: true, config });
    }
    for (const bucket of buckets) {
      await removeBucket(bucket, { force: true, config });
    }
  });

  it('setBucketType(Snapshot) turns a regular bucket into a snapshot bucket', async () => {
    const name = testBucket('type-snap');
    buckets.push(name);

    const created = await createBucket(name, { config });
    expect(created.error).toBeUndefined();
    expect(created.data?.isSnapshotEnabled).toBe(false);

    const result = await setBucketType(name, BucketTypes.Snapshot, { config });
    expect(
      result.error,
      `setBucketType failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data).toEqual({ bucket: name, updated: true });

    await expect.poll(() => isSnapshotEnabled(name), POLL).toBe(true);
  });

  it('setBucketType(Regular) turns a snapshot bucket back to regular', async () => {
    const name = testBucket('type-reg');
    buckets.push(name);

    const created = await createBucket(name, { enableSnapshot: true, config });
    expect(created.error).toBeUndefined();
    expect(created.data?.isSnapshotEnabled).toBe(true);

    const result = await setBucketType(name, BucketTypes.Regular, { config });
    expect(
      result.error,
      `setBucketType failed: ${result.error?.message}`
    ).toBeUndefined();

    await expect.poll(() => isSnapshotEnabled(name), POLL).toBe(false);
  });

  it('enableSnapshot converts a regular bucket into a snapshot bucket', async () => {
    const name = testBucket('enable');
    buckets.push(name);

    await createBucket(name, { config });

    const result = await enableSnapshot(name, { config });
    expect(
      result.error,
      `enableSnapshot failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data).toEqual({ bucket: name, updated: true });

    await expect.poll(() => isSnapshotEnabled(name), POLL).toBe(true);
  });

  it('disableSnapshot converts a snapshot bucket back to regular', async () => {
    const name = testBucket('disable');
    buckets.push(name);

    await createBucket(name, { enableSnapshot: true, config });

    const result = await disableSnapshot(name, { config });
    expect(
      result.error,
      `disableSnapshot failed: ${result.error?.message}`
    ).toBeUndefined();
    expect(result.data).toEqual({ bucket: name, updated: true });

    await expect.poll(() => isSnapshotEnabled(name), POLL).toBe(false);
  });

  it('disableSnapshot is rejected while the bucket has dependent forks', async () => {
    const source = testBucket('src');
    const fork = testBucket('fork');
    buckets.push(source);
    forks.push(fork);

    const createdSource = await createBucket(source, {
      enableSnapshot: true,
      config,
    });
    expect(createdSource.error).toBeUndefined();

    const createdFork = await createBucket(fork, {
      sourceBucketName: source,
      config,
    });
    expect(
      createdFork.error,
      `fork create failed: ${createdFork.error?.message}`
    ).toBeUndefined();

    // Wait until the parent reports the dependent fork so we exercise the
    // guard rather than a not-yet-consistent read.
    await expect
      .poll(
        async () =>
          (await getBucketInfo(source, { config })).data?.forkInfo?.hasChildren,
        { timeout: 30_000, interval: 2000 }
      )
      .toBe(true);

    const result = await disableSnapshot(source, { config });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe(
      'Bucket type cannot be changed from Snapshot to Regular while it has dependent forks'
    );

    // The change must have been rejected, leaving it a snapshot bucket.
    expect(await isSnapshotEnabled(source)).toBe(true);
  });
});
