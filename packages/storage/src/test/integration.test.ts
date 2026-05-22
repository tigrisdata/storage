import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { listForks } from '../lib/bucket/forks';
import { removeBucket } from '../lib/bucket/remove';
import {
  createBucketSnapshot,
  deleteBucketSnapshot,
  listBucketSnapshots,
} from '../lib/bucket/snapshot';
import { config } from '../lib/config';
import { copy } from '../lib/object/copy';
import { get } from '../lib/object/get';
import { head } from '../lib/object/head';
import { list } from '../lib/object/list';
import { move } from '../lib/object/move';
import { put } from '../lib/object/put';
import { remove } from '../lib/object/remove';
import { setObjectAccess } from '../lib/object/set/access';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

describe.skipIf(skipTests)('Tigris Storage Integration Tests', () => {
  const testFileName = `test-${Date.now()}.txt`;
  const testFileContent = 'Hello, Tigris Storage!';

  beforeEach(async () => {
    // Clean up any existing test file
    await remove(testFileName, { config });
  });

  describe('put', () => {
    it('should upload a file successfully', async () => {
      const result = await put(testFileName, testFileContent, {
        config,
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe(testFileName);
      expect(result.data?.size).toBeGreaterThan(0);
      expect(result.data?.url).toBeDefined();
      expect(result.data?.modified).toBeInstanceOf(Date);
    });

    it('should not prevent overwriting by default', async () => {
      // First upload
      await put(testFileName, testFileContent, {
        config,
      });

      // Second upload without allowOverwrite
      const result = await put(testFileName, 'new content', {
        allowOverwrite: false,
        config,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('File already exists');
    });

    it('should handle different content types', async () => {
      const htmlContent = '<h1>Test HTML</h1>';
      const htmlFileName = `test-${Date.now()}.html`;

      const result = await put(htmlFileName, htmlContent, {
        config,
        contentType: 'text/html',
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.contentType).toBe('text/html');

      // Cleanup
      await remove(htmlFileName, { config });
    });

    it('should add random suffix when requested', async () => {
      const result = await put('test.txt', testFileContent, {
        config,
        addRandomSuffix: true,
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.path).toMatch(/^test-[a-z0-9]+\.txt$/);

      // Cleanup
      if (result.data?.path) {
        await remove(result.data.path, { config });
      }
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      // Ensure test file exists
      await put(testFileName, testFileContent, {
        config,
      });
    });

    it('should retrieve file as string', async () => {
      const result = await get(testFileName, 'string', { config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBe(testFileContent);
    });

    it('should retrieve file as stream', async () => {
      const result = await get(testFileName, 'stream', { config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeInstanceOf(ReadableStream);
    });

    it('should retrieve file as File object', async () => {
      const result = await get(testFileName, 'file', { config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeInstanceOf(File);
      expect((result.data as File).name).toBe(testFileName);
    });

    it('should handle non-existent files', async () => {
      try {
        const result = await get(`non-existent-${Date.now()}.txt`, 'string', {
          config,
        });

        // If we get here, it should be an error result
        expect(result.error).toBeDefined();
        expect(result.data).toBeUndefined();
      } catch (error) {
        // If an exception is thrown, that's also acceptable for non-existent files
        expect(error).toBeDefined();
      }
    });
  });

  describe('head', () => {
    beforeEach(async () => {
      // Ensure test file exists
      await put(testFileName, testFileContent, {
        config,
      });
    });

    it('should retrieve file metadata', async () => {
      const result = await head(testFileName, { config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.size).toBeGreaterThan(0);
      expect(result.data?.modified).toBeInstanceOf(Date);
      expect(result.data?.path).toBe(testFileName);
      expect(result.data?.url).toBeDefined();
      expect(result.data?.contentType).toBeDefined();
      expect(result.data?.contentDisposition).toBeDefined();
      expect(result.data?.metadata).toEqual({});
    });

    it('should return undefined data for non-existent files', async () => {
      const result = await head('non-existent-file.txt', {
        config,
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeUndefined();
    });

    it('should round-trip user metadata from put to head', async () => {
      const metaFileName = `test-meta-${Date.now()}.txt`;
      // Mixed-case keys to assert S3-style lowercasing on both sides.
      const putResult = await put(metaFileName, testFileContent, {
        config,
        metadata: {
          Author: 'tigris',
          'Project-Id': 'abc-123',
        },
      });
      expect(putResult.error).toBeUndefined();
      expect(putResult.data?.metadata).toEqual({
        author: 'tigris',
        'project-id': 'abc-123',
      });

      const headResult = await head(metaFileName, { config });
      expect(headResult.error).toBeUndefined();
      expect(headResult.data?.metadata).toEqual({
        author: 'tigris',
        'project-id': 'abc-123',
      });

      await remove(metaFileName, { config });
    });
  });

  describe('list', () => {
    const testFiles = [
      `test-list-1-${Date.now()}.txt`,
      `test-list-2-${Date.now()}.txt`,
      `other-${Date.now()}.txt`,
    ];

    beforeEach(async () => {
      // Upload test files
      await Promise.all(
        testFiles.map((fileName) =>
          put(fileName, `Content for ${fileName}`, {
            config,
          })
        )
      );
    });

    afterEach(async () => {
      // Cleanup test files
      await Promise.all(
        testFiles.map((fileName) => remove(fileName, { config }))
      );
    });

    it('should list all files', async () => {
      const result = await list({ config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data?.items)).toBe(true);
      expect(result.data?.items.length).toBeGreaterThanOrEqual(
        testFiles.length
      );
    });

    it('should limit results', async () => {
      const result = await list({ limit: 1, config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.items.length).toBe(1);
    });

    it('should return pagination info', async () => {
      const result = await list({ config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(typeof result.data?.hasMore).toBe('boolean');
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      // Ensure test file exists
      await put(testFileName, testFileContent, {
        config,
      });
    });

    it('should delete a file successfully', async () => {
      const result = await remove(testFileName, { config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeUndefined();

      // Verify file is gone
      const headResult = await head(testFileName, { config });
      expect(headResult.error).toBeUndefined();
      expect(headResult.data).toBeUndefined();
    });

    it('should handle non-existent files gracefully', async () => {
      const result = await remove('non-existent-file.txt', {
        config,
      });

      // Should succeed silently for non-existent files
      expect(result.error).toBeUndefined();
      expect(result.data).toBeUndefined();
    });
  });

  describe('setObjectAccess', () => {
    const accessFileName = `test-access-${Date.now()}.txt`;

    beforeEach(async () => {
      await put(accessFileName, 'access test content', { config });
    });

    afterEach(async () => {
      await remove(accessFileName, { config });
    });

    it('should set access to public', async () => {
      const result = await setObjectAccess(accessFileName, {
        access: 'public',
        config,
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.path).toBe(accessFileName);
    });

    it('should set access to private', async () => {
      const result = await setObjectAccess(accessFileName, {
        access: 'private',
        config,
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.path).toBe(accessFileName);
    });
  });

  describe('copy', () => {
    const srcFileName = `test-copy-src-${Date.now()}.txt`;
    const srcContent = 'copy test content';
    const createdKeys: string[] = [];

    beforeEach(async () => {
      await put(srcFileName, srcContent, { config });
    });

    afterEach(async () => {
      await remove(srcFileName, { config });
      await Promise.all(createdKeys.map((key) => remove(key, { config })));
      createdKeys.length = 0;
    });

    it('should return error when src and dest are identical', async () => {
      const result = await copy(srcFileName, srcFileName, { config });
      expect(result.error?.message).toBe('src and dest must differ');
    });

    it('should copy an object and leave the source intact', async () => {
      const destKey = `test-copy-dest-${Date.now()}.txt`;
      createdKeys.push(destKey);

      const result = await copy(srcFileName, destKey, { config });

      expect(result.error).toBeUndefined();
      expect(result.data?.src).toBe(`${config.bucket}/${srcFileName}`);
      expect(result.data?.dest).toBe(`${config.bucket}/${destKey}`);

      // Source still exists.
      const srcHead = await head(srcFileName, { config });
      expect(srcHead.data).toBeDefined();

      // Destination has the same content.
      const destGet = await get(destKey, 'string', { config });
      expect(destGet.data).toBe(srcContent);
    });
  });

  describe('move', () => {
    const srcFileName = `test-move-src-${Date.now()}.txt`;
    const srcContent = 'move test content';
    const createdKeys: string[] = [];

    beforeEach(async () => {
      await put(srcFileName, srcContent, { config });
    });

    afterEach(async () => {
      await remove(srcFileName, { config });
      await Promise.all(createdKeys.map((key) => remove(key, { config })));
      createdKeys.length = 0;
    });

    it('should return error when src and dest are identical', async () => {
      const result = await move(srcFileName, srcFileName, { config });
      expect(result.error?.message).toBe('src and dest must differ');
    });

    it('should move an object and remove the source', async () => {
      const destKey = `test-move-dest-${Date.now()}.txt`;
      createdKeys.push(destKey);

      const result = await move(srcFileName, destKey, { config });

      expect(result.error).toBeUndefined();
      expect(result.data?.src).toBe(`${config.bucket}/${srcFileName}`);
      expect(result.data?.dest).toBe(`${config.bucket}/${destKey}`);

      // Source no longer exists.
      const srcHead = await head(srcFileName, { config });
      expect(srcHead.data).toBeUndefined();

      // Destination has the original content.
      const destGet = await get(destKey, 'string', { config });
      expect(destGet.data).toBe(srcContent);
    });
  });

  describe('deleteBucketSnapshot', () => {
    const snapshotBucket = `test-snap-delete-${Date.now()}`.toLowerCase();

    beforeAll(async () => {
      const result = await createBucket(snapshotBucket, {
        enableSnapshot: true,
        config,
      });
      expect(
        result.error,
        `bucket create failed: ${result.error?.message}`
      ).toBeUndefined();
    });

    afterAll(async () => {
      await removeBucket(snapshotBucket, { force: true, config });
    });

    it('should delete an existing snapshot and remove it from the list', async () => {
      const created = await createBucketSnapshot(snapshotBucket, {
        name: `delete-me-${Date.now()}`,
        config,
      });
      expect(created.error).toBeUndefined();
      expect(created.data?.snapshotVersion).toBeTruthy();

      const version = created.data?.snapshotVersion as string;

      const before = await listBucketSnapshots(snapshotBucket, { config });
      expect(before.error).toBeUndefined();
      expect(before.data?.snapshots.some((s) => s.version === version)).toBe(
        true
      );

      const result = await deleteBucketSnapshot(snapshotBucket, version, {
        config,
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.snapshotVersion).toBe(version);

      const after = await listBucketSnapshots(snapshotBucket, { config });
      expect(after.error).toBeUndefined();
      expect(after.data?.snapshots.some((s) => s.version === version)).toBe(
        false
      );
    });

    it('should only delete the targeted snapshot when multiple exist', async () => {
      const keep = await createBucketSnapshot(snapshotBucket, {
        name: `keep-${Date.now()}`,
        config,
      });
      const drop = await createBucketSnapshot(snapshotBucket, {
        name: `drop-${Date.now()}`,
        config,
      });
      expect(keep.error).toBeUndefined();
      expect(drop.error).toBeUndefined();

      const keepVersion = keep.data?.snapshotVersion as string;
      const dropVersion = drop.data?.snapshotVersion as string;

      const result = await deleteBucketSnapshot(snapshotBucket, dropVersion, {
        config,
      });
      expect(result.error).toBeUndefined();

      const after = await listBucketSnapshots(snapshotBucket, { config });
      const versions = after.data?.snapshots.map((s) => s.version) ?? [];
      expect(versions).toContain(keepVersion);
      expect(versions).not.toContain(dropVersion);

      // Cleanup the survivor so it doesn't accumulate.
      await deleteBucketSnapshot(snapshotBucket, keepVersion, { config });
    });

    it('should return error when sourceBucketName is missing', async () => {
      const result = await deleteBucketSnapshot('', 'some-version', { config });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe(
        'Source bucket name and snapshot version are required'
      );
    });

    it('should return error when snapshotVersion is missing', async () => {
      const result = await deleteBucketSnapshot(snapshotBucket, '', { config });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe(
        'Source bucket name and snapshot version are required'
      );
    });

    it('should return error for a non-existent snapshot version', async () => {
      const result = await deleteBucketSnapshot(
        snapshotBucket,
        'does-not-exist-0000000000',
        { config }
      );

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        'Unable to delete bucket snapshot'
      );
    });

    it('should return error when the bucket does not exist', async () => {
      const result = await deleteBucketSnapshot(
        `test-snap-missing-${Date.now()}`.toLowerCase(),
        'any-version',
        { config }
      );

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        'Unable to delete bucket snapshot'
      );
    });
  });

  describe('listForks', () => {
    const ts = Date.now();
    const sourceBucket = `test-fork-src-${ts}`.toLowerCase();
    const unrelatedBucket = `test-fork-unrelated-${ts}`.toLowerCase();
    const forkA = `test-fork-a-${ts}`.toLowerCase();
    const forkB = `test-fork-b-${ts}`.toLowerCase();
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

      const unrelated = await createBucket(unrelatedBucket, {
        enableSnapshot: true,
        config,
      });
      expect(unrelated.error).toBeUndefined();
      bucketsToCleanup.push(unrelatedBucket);

      const a = await createBucket(forkA, {
        sourceBucketName: sourceBucket,
        config,
      });
      expect(a.error).toBeUndefined();
      bucketsToCleanup.push(forkA);

      const b = await createBucket(forkB, {
        sourceBucketName: sourceBucket,
        config,
      });
      expect(b.error).toBeUndefined();
      bucketsToCleanup.push(forkB);
    });

    afterAll(async () => {
      // Remove forks before parents so the source bucket can be deleted.
      const order = [forkA, forkB, sourceBucket, unrelatedBucket].filter((b) =>
        bucketsToCleanup.includes(b)
      );
      for (const bucket of order) {
        await removeBucket(bucket, { force: true, config });
      }
    });

    it('should list all forks of a source bucket', async () => {
      const result = await listForks(sourceBucket, { config });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();

      const names = result.data?.forks.map((f) => f.name) ?? [];
      expect(names).toContain(forkA);
      expect(names).toContain(forkB);
    });

    it('should not include buckets forked from a different source', async () => {
      const result = await listForks(sourceBucket, { config });

      const names = result.data?.forks.map((f) => f.name) ?? [];
      expect(names).not.toContain(unrelatedBucket);
      expect(names).not.toContain(sourceBucket);
    });

    it('should populate fork metadata for each returned bucket', async () => {
      const result = await listForks(sourceBucket, { config });

      const fork = result.data?.forks.find((f) => f.name === forkA);
      expect(fork).toBeDefined();
      expect(fork?.creationDate).toBeInstanceOf(Date);
      expect(fork?.forkCreatedAt).toBeInstanceOf(Date);
      expect(fork?.snapshotCreatedAt).toBeInstanceOf(Date);
      expect(typeof fork?.snapshot).toBe('string');
    });

    it('should return an empty list when the source has no forks', async () => {
      const result = await listForks(unrelatedBucket, { config });

      expect(result.error).toBeUndefined();
      expect(result.data?.forks).toEqual([]);
    });
  });

  describe('end-to-end workflow', () => {
    it('should complete full upload -> get -> delete cycle', async () => {
      const fileName = `test-e2e-${Date.now()}.txt`;
      const content = 'End-to-end test content';

      // Upload
      const putResult = await put(fileName, content, {
        config,
        contentType: 'text/plain',
      });
      expect(putResult.error).toBeUndefined();
      expect(putResult.data).toBeDefined();

      // Verify metadata
      const headResult = await head(fileName, { config });
      expect(headResult.error).toBeUndefined();
      expect(headResult.data).toBeDefined();
      expect(headResult.data?.size).toBeGreaterThan(0);

      // Download and verify content
      const getResult = await get(fileName, 'string', { config });
      expect(getResult.error).toBeUndefined();
      expect(getResult.data).toBe(content);

      // Delete
      const removeResult = await remove(fileName, { config });
      expect(removeResult.error).toBeUndefined();
      expect(removeResult.data).toBeUndefined();

      // Verify deletion
      const finalHeadResult = await head(fileName, { config });
      expect(finalHeadResult.error).toBeUndefined();
      expect(finalHeadResult.data).toBeUndefined();
    });
  });
});
