import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { removeBucket } from '../lib/bucket/remove';
import { config } from '../lib/config';
import { get } from '../lib/object/get';
import { head } from '../lib/object/head';
import { listVersions } from '../lib/object/list-versions';
import { put } from '../lib/object/put';
import { remove } from '../lib/object/remove';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

describe.skipIf(skipTests)('Object versioning Integration Tests', () => {
  const bucket = `test-versions-${Date.now()}`.toLowerCase();
  const bucketConfig = { ...config, bucket };

  beforeAll(async () => {
    const result = await createBucket(bucket, {
      enableSnapshot: true,
      config,
    });
    expect(
      result.error,
      `bucket create failed: ${result.error?.message}`
    ).toBeUndefined();
  });

  afterAll(async () => {
    await removeBucket(bucket, { force: true, config });
  });

  it('lists multiple versions of the same key', async () => {
    const key = `nested/key-${Date.now()}.txt`;

    await put(key, 'v1', { config: bucketConfig });
    await put(key, 'v2', { config: bucketConfig });

    const result = await listVersions({
      prefix: key,
      config: bucketConfig,
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.versions).toHaveLength(2);
    expect(result.data?.deleteMarkers).toHaveLength(0);

    const versions = result.data?.versions ?? [];
    expect(versions.filter((v) => v.isLatest)).toHaveLength(1);
    for (const v of versions) {
      expect(v.name).toBe(key);
      expect(v.versionId).toBeTruthy();
      expect(v.lastModified).toBeInstanceOf(Date);
    }
  });

  it('reads a prior version with get(versionId) and head(versionId)', async () => {
    const key = `read-prev-${Date.now()}.txt`;

    await put(key, 'old', { config: bucketConfig });
    await put(key, 'new', { config: bucketConfig });

    const { data: list } = await listVersions({
      prefix: key,
      config: bucketConfig,
    });
    const older = list?.versions.find((v) => !v.isLatest);
    expect(older).toBeDefined();

    const getRes = await get(key, 'string', {
      versionId: older?.versionId,
      config: bucketConfig,
    });
    expect(getRes.error).toBeUndefined();
    expect(getRes.data).toBe('old');

    const latest = await get(key, 'string', { config: bucketConfig });
    expect(latest.data).toBe('new');

    const headRes = await head(key, {
      versionId: older?.versionId,
      config: bucketConfig,
    });
    expect(headRes.error).toBeUndefined();
    expect(headRes.data?.path).toBe(key);
  });

  it('remove() without versionId creates a delete marker', async () => {
    const key = `del-marker-${Date.now()}.txt`;
    await put(key, 'v1', { config: bucketConfig });

    const removeRes = await remove(key, { config: bucketConfig });
    expect(removeRes.error).toBeUndefined();

    const { data } = await listVersions({
      prefix: key,
      config: bucketConfig,
    });
    expect(data?.versions).toHaveLength(1);
    expect(data?.deleteMarkers).toHaveLength(1);
    expect(data?.deleteMarkers[0]?.isLatest).toBe(true);
  });

  it('remove() with versionId permanently deletes that version', async () => {
    const key = `perm-del-${Date.now()}.txt`;
    await put(key, 'v1', { config: bucketConfig });
    await put(key, 'v2', { config: bucketConfig });

    const { data: before } = await listVersions({
      prefix: key,
      config: bucketConfig,
    });
    expect(before?.versions).toHaveLength(2);

    const older = before?.versions.find((v) => !v.isLatest);
    expect(older?.versionId).toBeTruthy();

    const removeRes = await remove(key, {
      versionId: older?.versionId,
      config: bucketConfig,
    });
    expect(removeRes.error).toBeUndefined();

    const { data: after } = await listVersions({
      prefix: key,
      config: bucketConfig,
    });
    expect(after?.versions).toHaveLength(1);
    expect(after?.deleteMarkers).toHaveLength(0);
    expect(after?.versions.some((v) => v.versionId === older?.versionId)).toBe(
      false
    );
  });

  it('paginates with keyMarker / versionIdMarker', async () => {
    const prefix = `page-${Date.now()}/`;
    const keys = [`${prefix}a.txt`, `${prefix}b.txt`, `${prefix}c.txt`];
    for (const k of keys) {
      await put(k, 'x', { config: bucketConfig });
    }

    const first = await listVersions({
      prefix,
      limit: 2,
      config: bucketConfig,
    });
    expect(first.data?.hasMore).toBe(true);
    expect(first.data?.versions).toHaveLength(2);
    expect(first.data?.nextKeyMarker).toBeTruthy();

    const second = await listVersions({
      prefix,
      keyMarker: first.data?.nextKeyMarker,
      versionIdMarker: first.data?.nextVersionIdMarker,
      config: bucketConfig,
    });
    expect(second.data?.hasMore).toBe(false);
    expect(second.data?.versions.length).toBeGreaterThanOrEqual(1);

    const firstNames = first.data?.versions.map((v) => v.name) ?? [];
    const secondNames = second.data?.versions.map((v) => v.name) ?? [];
    expect(firstNames.some((n) => secondNames.includes(n))).toBe(false);
  });
});
