import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { removeBucket } from '../lib/bucket/remove';
import { updateBucket } from '../lib/bucket/update';
import { getConfig } from '../lib/config';
import { list } from '../lib/object/list';
import { listVersions } from '../lib/object/list-versions';
import { put } from '../lib/object/put';
import { purgeDeletedObject, remove } from '../lib/object/remove';
import { restoreDeletedObject } from '../lib/object/restore';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const config = getConfig();

// The gateway rejects a retention outside this range.
const RETENTION_DAYS = 7;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The soft-delete views are eventually consistent, so a delete does not show
 * up in them straight away. Poll instead of sleeping a fixed amount.
 */
async function poll<T>(
  check: () => Promise<T | undefined>,
  attempts = 20,
  delayMs = 750
): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await check();
    if (result !== undefined) {
      return result;
    }
    await sleep(delayMs);
  }
  return undefined;
}

type BucketConfig = typeof config;

/** The recoverable version of `key`, if the soft-delete view has one yet. */
async function deletedVersionOf(
  bucketConfig: BucketConfig,
  key: string
): Promise<string | undefined> {
  const { data } = await listVersions({
    prefix: key,
    deleted: true,
    config: bucketConfig,
  });
  return data?.versions.find((v) => v.name === key)?.versionId;
}

/**
 * Write a key and delete it so that a recoverable copy exists, returning that
 * copy's version.
 *
 * Enabling soft delete on a bucket takes a few seconds to reach the data
 * plane, and a delete that lands inside that window is a plain hard delete
 * that leaves nothing behind to find. No amount of polling recovers from
 * that, so re-create and re-delete the key until a recoverable copy actually
 * appears.
 */
async function softDeleteObject(
  bucketConfig: BucketConfig,
  key: string,
  content = 'content'
): Promise<string | undefined> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await put(key, content, { config: bucketConfig });
    await remove(key, { config: bucketConfig });

    const versionId = await poll(
      () => deletedVersionOf(bucketConfig, key),
      6,
      500
    );
    if (versionId) {
      return versionId;
    }
  }
  return undefined;
}

/**
 * Wait for deleted keys to appear in `list({ deleted: true })`. This is a
 * different index from the versions view and settles on its own schedule, so
 * assertions about the listing have to wait on the listing.
 */
function waitForDeletedListing(
  bucketConfig: BucketConfig,
  prefix: string,
  expectedCount: number
): Promise<string[] | undefined> {
  return poll(async () => {
    const { data } = await list({
      prefix,
      deleted: true,
      config: bucketConfig,
    });
    const names = data?.items.map((i) => i.name) ?? [];
    return names.length >= expectedCount ? names : undefined;
  });
}

/** Wait for a key to be present in, or absent from, the live listing. */
function waitForLiveListing(
  bucketConfig: BucketConfig,
  key: string,
  present: boolean
): Promise<boolean | undefined> {
  return poll(async () => {
    const { data } = await list({ prefix: key, config: bucketConfig });
    const found = (data?.items ?? []).some((i) => i.name === key);
    return found === present ? true : undefined;
  });
}

describe.skipIf(skipTests)('Object soft delete Integration Tests', () => {
  const bucket = `test-soft-delete-${Date.now()}`.toLowerCase();
  const bucketConfig = { ...config, bucket };

  beforeAll(async () => {
    const created = await createBucket(bucket, { config });
    expect(
      created.error,
      `bucket create failed: ${created.error?.message}`
    ).toBeUndefined();

    const enabled = await updateBucket(bucket, {
      softDelete: { enabled: true, retentionDays: RETENTION_DAYS },
      config,
    });
    expect(
      enabled.error,
      `enabling soft delete failed: ${enabled.error?.message}`
    ).toBeUndefined();

    // Absorb the propagation window once here rather than in every test.
    const canary = await softDeleteObject(bucketConfig, '.canary');
    expect(canary, 'soft delete never took effect on the bucket').toBeTruthy();
  });

  afterAll(async () => {
    await removeBucket(bucket, { force: true, config });
  });

  it('list({ deleted: true }) returns deleted objects and omits live ones', async () => {
    const deletedKey = `deleted-${Date.now()}.txt`;
    const liveKey = `live-${Date.now()}.txt`;

    await put(liveKey, 'here', { config: bucketConfig });
    const versionId = await softDeleteObject(bucketConfig, deletedKey, 'gone');
    expect(versionId).toBeTruthy();
    await waitForDeletedListing(bucketConfig, deletedKey, 1);

    const deleted = await list({ deleted: true, config: bucketConfig });
    expect(deleted.error).toBeUndefined();
    const deletedNames = deleted.data?.items.map((i) => i.name) ?? [];
    expect(deletedNames).toContain(deletedKey);
    // The soft-delete view replaces the live listing rather than adding to it.
    expect(deletedNames).not.toContain(liveKey);

    await waitForLiveListing(bucketConfig, deletedKey, false);
    const live = await list({ config: bucketConfig });
    const liveNames = live.data?.items.map((i) => i.name) ?? [];
    expect(liveNames).toContain(liveKey);
    expect(liveNames).not.toContain(deletedKey);
  });

  it('list({ deleted: true }) honours prefix, delimiter and pagination', async () => {
    const prefix = `page-${Date.now()}/`;
    const keys = [`${prefix}a.txt`, `${prefix}b.txt`];
    for (const key of keys) {
      expect(await softDeleteObject(bucketConfig, key)).toBeTruthy();
    }
    await waitForDeletedListing(bucketConfig, prefix, keys.length);

    const byPrefix = await list({
      deleted: true,
      prefix,
      config: bucketConfig,
    });
    expect(byPrefix.data?.items.map((i) => i.name).sort()).toEqual(keys);

    const byDelimiter = await list({
      deleted: true,
      delimiter: '/',
      config: bucketConfig,
    });
    expect(byDelimiter.data?.commonPrefixes).toContain(prefix);

    const firstPage = await list({
      deleted: true,
      prefix,
      limit: 1,
      config: bucketConfig,
    });
    expect(firstPage.data?.items).toHaveLength(1);
    expect(firstPage.data?.hasMore).toBe(true);
    expect(firstPage.data?.paginationToken).toBeTruthy();

    const secondPage = await list({
      deleted: true,
      prefix,
      limit: 1,
      paginationToken: firstPage.data?.paginationToken,
      config: bucketConfig,
    });
    expect(secondPage.data?.items).toHaveLength(1);
    expect(secondPage.data?.items[0]?.name).not.toBe(
      firstPage.data?.items[0]?.name
    );
  });

  it('listVersions({ deleted: true }) exposes recoverable versions', async () => {
    const key = `versions-${Date.now()}.txt`;
    expect(await softDeleteObject(bucketConfig, key, 'v1')).toBeTruthy();

    const deleted = await listVersions({
      prefix: key,
      deleted: true,
      config: bucketConfig,
    });
    expect(deleted.error).toBeUndefined();
    expect(deleted.data?.versions.length).toBeGreaterThanOrEqual(1);
    expect(deleted.data?.versions[0]?.name).toBe(key);
    expect(deleted.data?.versions[0]?.versionId).toBeTruthy();

    // Without the flag the deleted object is not reported at all.
    const live = await listVersions({ prefix: key, config: bucketConfig });
    expect(live.data?.versions).toHaveLength(0);
  });

  it('restoreDeletedObject() brings a deleted object back', async () => {
    const key = `restore-${Date.now()}.txt`;
    const versionId = await softDeleteObject(bucketConfig, key, 'restore-me');
    expect(versionId, 'no soft-deleted version found to restore').toBeTruthy();

    const restored = await restoreDeletedObject(key, versionId as string, {
      config: bucketConfig,
    });
    expect(restored.error).toBeUndefined();
    expect(restored.data?.path).toBe(key);
    expect(restored.data?.versionId).toBe(versionId);

    await waitForLiveListing(bucketConfig, key, true);
    const live = await list({ prefix: key, config: bucketConfig });
    expect(live.data?.items.map((i) => i.name)).toContain(key);
  });

  it('purgeDeletedObject() destroys a deleted version for good', async () => {
    const key = `purge-${Date.now()}.txt`;
    const versionId = await softDeleteObject(bucketConfig, key, 'purge-me');
    expect(versionId, 'no soft-deleted version found to purge').toBeTruthy();

    const purged = await purgeDeletedObject(key, versionId as string, {
      config: bucketConfig,
    });
    expect(purged.error).toBeUndefined();
    expect(purged.data?.path).toBe(key);
    expect(purged.data?.versionId).toBe(versionId);

    // The version is gone from the soft-delete view, so it can no longer be
    // restored.
    const stillThere = await poll(async () => {
      const found = await deletedVersionOf(bucketConfig, key);
      return found === versionId ? undefined : false;
    });
    expect(stillThere).toBe(false);
  });

  // Object keys reach the gateway through the AWS SDK here, which signs and
  // encodes them itself, but this repo has been bitten by key-encoding bugs
  // that only surface end-to-end against a real signer. Cover both shapes.
  it.each([
    ['a nested key', (stamp: number) => `enc-${stamp}/nested/file.txt`],
    [
      'a key needing encoding',
      (stamp: number) => `enc-${stamp}/a file &=+(1).txt`,
    ],
  ])('restores and purges %s', async (_label, makeKey) => {
    const stamp = Date.now();

    const restoreKey = makeKey(stamp);
    const restoreVersion = await softDeleteObject(bucketConfig, restoreKey);
    expect(restoreVersion).toBeTruthy();

    const restored = await restoreDeletedObject(
      restoreKey,
      restoreVersion as string,
      { config: bucketConfig }
    );
    expect(restored.error).toBeUndefined();
    await waitForLiveListing(bucketConfig, restoreKey, true);
    const live = await list({ prefix: restoreKey, config: bucketConfig });
    expect(live.data?.items.map((i) => i.name)).toContain(restoreKey);

    const purgeKey = `${makeKey(stamp)}.purge`;
    const purgeVersion = await softDeleteObject(bucketConfig, purgeKey);
    expect(purgeVersion).toBeTruthy();

    const purged = await purgeDeletedObject(purgeKey, purgeVersion as string, {
      config: bucketConfig,
    });
    expect(purged.error).toBeUndefined();

    const stillThere = await poll(async () => {
      const found = await deletedVersionOf(bucketConfig, purgeKey);
      return found === purgeVersion ? undefined : false;
    });
    expect(stillThere).toBe(false);
  });

  it('restoreDeletedObject() and purgeDeletedObject() validate their input', async () => {
    const missingPath = await restoreDeletedObject('', '1', {
      config: bucketConfig,
    });
    expect(missingPath.error?.message).toBe('Object path is required');

    const missingVersion = await restoreDeletedObject('some-key.txt', '', {
      config: bucketConfig,
    });
    expect(missingVersion.error?.message).toBe('versionId is required');

    const missingPurgePath = await purgeDeletedObject('', '1', {
      config: bucketConfig,
    });
    expect(missingPurgePath.error?.message).toBe('Object path is required');

    const missingPurgeVersion = await purgeDeletedObject('some-key.txt', '', {
      config: bucketConfig,
    });
    expect(missingPurgeVersion.error?.message).toBe('versionId is required');
  });
});
