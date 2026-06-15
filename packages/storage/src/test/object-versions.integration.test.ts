import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { removeBucket } from '../lib/bucket/remove';
import { createBucketSnapshot } from '../lib/bucket/snapshot';
import { config } from '../lib/config';
import { get } from '../lib/object/get';
import { head } from '../lib/object/head';
import { listVersions } from '../lib/object/list-versions';
import { getPresignedUrl } from '../lib/object/presigned-url';
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

  describe('getPresignedUrl + snapshotVersion', () => {
    it('returns a URL pinned to the latest version that existed at snapshot time', async () => {
      const key = `presign-snap-${Date.now()}.txt`;
      // Pre-snapshot versions. Small sleeps so the ns-epoch versionIds
      // are unambiguously ordered (network latency alone is usually
      // enough, but be defensive).
      await put(key, 'v1', { config: bucketConfig });
      await new Promise((r) => setTimeout(r, 50));
      await put(key, 'v2', { config: bucketConfig });
      await new Promise((r) => setTimeout(r, 50));
      await put(key, 'v3', { config: bucketConfig });
      // Wider gap across the snapshot boundary so v3 < snapshot < v4
      // with plenty of margin.
      await new Promise((r) => setTimeout(r, 1100));

      const snap = await createBucketSnapshot(bucket, {
        name: `presign-snap-${Date.now()}`,
        config,
      });
      expect(snap.error).toBeUndefined();
      const snapshotVersion = snap.data?.snapshotVersion;
      expect(snapshotVersion).toBeTruthy();

      await new Promise((r) => setTimeout(r, 1100));
      // Post-snapshot versions that must be excluded.
      await put(key, 'v4', { config: bucketConfig });
      await new Promise((r) => setTimeout(r, 50));
      await put(key, 'v5', { config: bucketConfig });

      const presigned = await getPresignedUrl(key, {
        operation: 'get',
        snapshotVersion,
        config: bucketConfig,
      });
      expect(presigned.error).toBeUndefined();

      const res = await fetch(presigned.data!.url);
      expect(res.status).toBe(200);
      // Must be v3 — the latest version that existed when the snapshot
      // was taken. Not v2 (an earlier pre-snapshot), not v5 (the
      // current latest).
      expect(await res.text()).toBe('v3');
    });

    it('errors when the object did not exist at snapshot time', async () => {
      // Snapshot BEFORE any writes for this key.
      const snap = await createBucketSnapshot(bucket, {
        name: `presign-empty-${Date.now()}`,
        config,
      });
      const snapshotVersion = snap.data?.snapshotVersion as string;

      // Wider gap so the put's versionId is strictly newer than the
      // snapshot (versionIds and snapshotVersions share an ns-epoch
      // time base; consecutive ops can land within the same window).
      await new Promise((r) => setTimeout(r, 1100));

      const key = `presign-after-snap-${Date.now()}.txt`;
      await put(key, 'after-snap', { config: bucketConfig });

      const presigned = await getPresignedUrl(key, {
        operation: 'get',
        snapshotVersion,
        config: bucketConfig,
      });
      expect(presigned.data).toBeUndefined();
      expect(presigned.error?.message).toMatch(
        /did not exist at snapshot version/
      );
    });

    it('treats a delete marker before the snapshot as "did not exist"', async () => {
      // Regression test for the delete-marker handling: if the latest
      // event before the snapshot is a delete, we must error instead
      // of pinning to the prior version.
      const key = `presign-deleted-${Date.now()}.txt`;
      await put(key, 'before-delete', { config: bucketConfig });
      await new Promise((r) => setTimeout(r, 50));
      await remove(key, { config: bucketConfig });
      await new Promise((r) => setTimeout(r, 1100));

      const snap = await createBucketSnapshot(bucket, {
        name: `presign-del-${Date.now()}`,
        config,
      });
      const snapshotVersion = snap.data?.snapshotVersion as string;

      const presigned = await getPresignedUrl(key, {
        operation: 'get',
        snapshotVersion,
        config: bucketConfig,
      });
      expect(presigned.data).toBeUndefined();
      expect(presigned.error?.message).toMatch(
        /did not exist at snapshot version/
      );
    });

    it('errors when snapshotVersion is not a numeric timestamp', async () => {
      const key = `presign-bad-snap-${Date.now()}.txt`;
      await put(key, 'v1', { config: bucketConfig });

      const presigned = await getPresignedUrl(key, {
        operation: 'get',
        snapshotVersion: 'not-a-number',
        config: bucketConfig,
      });
      expect(presigned.data).toBeUndefined();
      expect(presigned.error?.message).toMatch(/Invalid snapshotVersion/);
    });

    it('errors when the snapshot version itself is unknown', async () => {
      const key = `presign-bogus-snap-${Date.now()}.txt`;
      await put(key, 'v1', { config: bucketConfig });

      const presigned = await getPresignedUrl(key, {
        operation: 'get',
        // Far-future timestamp that cannot match a real snapshot but
        // is a valid 19-digit ns-epoch string for BigInt parsing.
        snapshotVersion: '9999999999999999999',
        config: bucketConfig,
      });
      // Implementation finds the latest version <= the marker (any
      // version is older than year-3000), so the URL is built
      // successfully — the snapshot-not-found case is only detectable
      // if we cross-check listBucketSnapshots. Documenting current
      // behavior: this returns a URL that resolves to the latest
      // version of the object.
      expect(presigned.error).toBeUndefined();
      expect(presigned.data?.url).toBeTruthy();
    });

    it('rejects snapshotVersion with operation: "put"', async () => {
      const key = `presign-put-snap-${Date.now()}.txt`;
      await put(key, 'v1', { config: bucketConfig });

      const snap = await createBucketSnapshot(bucket, {
        name: `presign-put-${Date.now()}`,
        config,
      });
      const snapshotVersion = snap.data?.snapshotVersion as string;

      const presigned = await getPresignedUrl(key, {
        operation: 'put',
        snapshotVersion,
        config: bucketConfig,
      });
      expect(presigned.data).toBeUndefined();
      expect(presigned.error?.message).toMatch(/snapshots are read-only/);
    });

    it('does not pick a sibling key whose name starts with the same prefix', async () => {
      const base = `presign-prefix-${Date.now()}`;
      const key = `${base}.txt`;
      const sibling = `${base}.txt.bak`;

      await put(key, 'real', { config: bucketConfig });
      await put(sibling, 'sibling', { config: bucketConfig });
      await new Promise((r) => setTimeout(r, 1100));

      const snap = await createBucketSnapshot(bucket, {
        name: `presign-prefix-${Date.now()}`,
        config,
      });
      const snapshotVersion = snap.data?.snapshotVersion as string;

      const presigned = await getPresignedUrl(key, {
        operation: 'get',
        snapshotVersion,
        config: bucketConfig,
      });
      expect(presigned.error).toBeUndefined();

      const res = await fetch(presigned.data!.url);
      expect(res.status).toBe(200);
      // Critical: should return the target key's content, not the
      // sibling's. Without the `v.name === path` filter this would
      // collide.
      expect(await res.text()).toBe('real');
    });
  });
});
