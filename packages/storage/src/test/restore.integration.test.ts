import { afterEach, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { removeBucket } from '../lib/bucket/remove';
import { createBucketSnapshot } from '../lib/bucket/snapshot';
import { getConfig } from '../lib/config';
import { put } from '../lib/object/put';
import {
  getRestoreInfo,
  RestoreStatus,
  restoreObject,
} from '../lib/object/restore';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const config = getConfig();

const testBucket = (suffix: string) =>
  `test-restore-${suffix}-${Date.now()}`.toLowerCase();

describe.skipIf(skipTests)('restoreObject Integration Tests', () => {
  const bucketsToCleanup: string[] = [];

  // Archiving and restore are asynchronous, so poll the restore status until
  // it reaches the expected state rather than reading once.
  const POLL = { timeout: 30000, interval: 2000 };

  afterEach(async () => {
    for (const bucket of bucketsToCleanup) {
      await removeBucket(bucket, { force: true, config });
    }
    bucketsToCleanup.length = 0;
  });

  it('should restore an archived object and report it in progress', async () => {
    const bucket = testBucket('glacier');
    bucketsToCleanup.push(bucket);
    const bucketConfig = { ...config, bucket };

    // Archive bucket: objects uploaded to it default to the GLACIER tier.
    const created = await createBucket(bucket, {
      defaultTier: 'GLACIER',
      config,
    });
    expect(
      created.error,
      `create bucket failed: ${created.error?.message}`
    ).toBeUndefined();

    // Upload a 1-byte object; it inherits the bucket's GLACIER default.
    const key = `archived-${Date.now()}.txt`;
    const uploaded = await put(key, 'a', { config: bucketConfig });
    expect(
      uploaded.error,
      `put failed: ${uploaded.error?.message}`
    ).toBeUndefined();
    expect(uploaded.data?.size).toBe(1);

    // Before any restore, the archived object should report as Archived.
    await expect
      .poll(async () => {
        const info = await getRestoreInfo(key, { config: bucketConfig });
        return info.data?.status;
      }, POLL)
      .toBe(RestoreStatus.Archived);

    // Initiate the restore.
    const restored = await restoreObject(key, { config: bucketConfig });
    expect(
      restored.error,
      `restore failed: ${restored.error?.message}`
    ).toBeUndefined();
    expect(restored.data?.path).toBe(key);

    // The object should now report a restore in progress.
    await expect
      .poll(async () => {
        const info = await getRestoreInfo(key, { config: bucketConfig });
        return info.data?.status;
      }, POLL)
      .toBe(RestoreStatus.InProgress);
  });

  it('should report no restore info for non-archived and missing objects', async () => {
    const bucket = testBucket('standard');
    bucketsToCleanup.push(bucket);
    const bucketConfig = { ...config, bucket };

    // A standard (non-archived) bucket.
    const created = await createBucket(bucket, { config });
    expect(
      created.error,
      `create bucket failed: ${created.error?.message}`
    ).toBeUndefined();

    // A missing object has no restore information.
    const missing = await getRestoreInfo(`missing-${Date.now()}.txt`, {
      config: bucketConfig,
    });
    expect(missing.error).toBeUndefined();
    expect(missing.data).toBeUndefined();

    // A non-archived object also has no restore information.
    const key = `standard-${Date.now()}.txt`;
    const uploaded = await put(key, 'a', { config: bucketConfig });
    expect(
      uploaded.error,
      `put failed: ${uploaded.error?.message}`
    ).toBeUndefined();

    const info = await getRestoreInfo(key, { config: bucketConfig });
    expect(info.error).toBeUndefined();
    expect(info.data).toBeUndefined();
  });

  it('should accept a restore request for a non-archived object', async () => {
    const bucket = testBucket('non-archived');
    bucketsToCleanup.push(bucket);
    const bucketConfig = { ...config, bucket };

    const created = await createBucket(bucket, { config });
    expect(
      created.error,
      `create bucket failed: ${created.error?.message}`
    ).toBeUndefined();

    const key = `standard-${Date.now()}.txt`;
    const uploaded = await put(key, 'a', { config: bucketConfig });
    expect(
      uploaded.error,
      `put failed: ${uploaded.error?.message}`
    ).toBeUndefined();

    // Unlike AWS S3 (which rejects with InvalidObjectState), the Tigris
    // gateway accepts a restore request for a non-archived object without
    // error.
    const restored = await restoreObject(key, { config: bucketConfig });
    expect(restored.error).toBeUndefined();
    expect(restored.data?.path).toBe(key);
  });
});

describe.skipIf(skipTests)(
  'restoreObject + snapshotVersion Integration Tests',
  () => {
    const bucketsToCleanup: string[] = [];

    const POLL = { timeout: 30000, interval: 2000 };

    afterEach(async () => {
      for (const bucket of bucketsToCleanup) {
        await removeBucket(bucket, { force: true, config });
      }
      bucketsToCleanup.length = 0;
    });

    it('restores and reports an archived object as of a specific snapshot version', async () => {
      const bucket = testBucket('snap-glacier');
      bucketsToCleanup.push(bucket);
      const bucketConfig = { ...config, bucket };

      // Snapshot-enabled archive bucket: objects default to GLACIER, and we can
      // pin reads/restores to a point-in-time snapshot.
      const created = await createBucket(bucket, {
        defaultTier: 'GLACIER',
        enableSnapshot: true,
        config,
      });
      expect(
        created.error,
        `create bucket failed: ${created.error?.message}`
      ).toBeUndefined();

      // Upload a 1-byte object; it inherits the bucket's GLACIER default.
      const key = `archived-${Date.now()}.txt`;
      const uploaded = await put(key, 'a', { config: bucketConfig });
      expect(
        uploaded.error,
        `put failed: ${uploaded.error?.message}`
      ).toBeUndefined();

      // Wait until the object is recognized as archived in live state before
      // snapshotting, so the snapshot captures it in the GLACIER tier.
      await expect
        .poll(async () => {
          const info = await getRestoreInfo(key, { config: bucketConfig });
          return info.data?.status;
        }, POLL)
        .toBe(RestoreStatus.Archived);

      // Take a snapshot that captures the archived object.
      const snap = await createBucketSnapshot(bucket, {
        name: `restore-snap-${Date.now()}`,
        config,
      });
      expect(
        snap.error,
        `snapshot failed: ${snap.error?.message}`
      ).toBeUndefined();
      const snapshotVersion = snap.data?.snapshotVersion;
      expect(snapshotVersion).toBeTruthy();

      // Inspecting the object as of the snapshot should report it archived.
      await expect
        .poll(async () => {
          const info = await getRestoreInfo(key, {
            snapshotVersion,
            config: bucketConfig,
          });
          return info.data?.status;
        }, POLL)
        .toBe(RestoreStatus.Archived);

      // Restore the object as of the snapshot version.
      const restored = await restoreObject(key, {
        snapshotVersion,
        config: bucketConfig,
      });
      expect(
        restored.error,
        `restore failed: ${restored.error?.message}`
      ).toBeUndefined();
      expect(restored.data?.path).toBe(key);

      // Reading restore info as of the snapshot should now report progress.
      await expect
        .poll(async () => {
          const info = await getRestoreInfo(key, {
            snapshotVersion,
            config: bucketConfig,
          });
          return info.data?.status;
        }, POLL)
        .toBe(RestoreStatus.InProgress);
    });
  }
);
