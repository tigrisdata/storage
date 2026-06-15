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
import { getBucketInfo } from '../lib/bucket/info';
import { listBuckets } from '../lib/bucket/list';
import { removeBucket } from '../lib/bucket/remove';
import { restoreBucket } from '../lib/bucket/restore';
import {
  createBucketSnapshot,
  deleteBucketSnapshot,
  listBucketSnapshots,
} from '../lib/bucket/snapshot';
import { updateBucket } from '../lib/bucket/update';
import { config } from '../lib/config';
import { copy } from '../lib/object/copy';
import { get } from '../lib/object/get';
import { head } from '../lib/object/head';
import { list } from '../lib/object/list';
import { move } from '../lib/object/move';
import { put } from '../lib/object/put';
import { remove } from '../lib/object/remove';
import { setObjectAccess } from '../lib/object/set/access';
import { getSignedUploadUrl } from '../lib/object/signed-upload-url';
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
      expect(result.data?.etag).toMatch(/^".+"$/);
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

    it('should read a byte range as string (start and end inclusive)', async () => {
      // testFileContent = 'Hello, Tigris Storage!' (22 bytes)
      const result = await get(testFileName, 'string', {
        config,
        range: { start: 0, end: 4 },
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBe('Hello');
    });

    it('should read a byte range as string (start through EOF)', async () => {
      const result = await get(testFileName, 'string', {
        config,
        range: { start: 7 },
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBe('Tigris Storage!');
    });

    it('should read a byte range as a stream', async () => {
      const result = await get(testFileName, 'stream', {
        config,
        range: { start: 0, end: 4 },
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeInstanceOf(ReadableStream);

      const reader = (result.data as ReadableStream).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      expect(total).toBe(5);
    });

    it('should reject an invalid range with a client-side error', async () => {
      const result = await get(testFileName, 'string', {
        config,
        range: { start: 5, end: 2 },
      });
      expect(result.data).toBeUndefined();
      expect(result.error?.message).toMatch(/range\.end/);
    });

    it('should return body + metadata when includeMetadata is true', async () => {
      const metaFileName = `test-get-meta-${Date.now()}.txt`;
      await put(metaFileName, testFileContent, {
        config,
        contentType: 'text/plain',
        metadata: { Author: 'tigris' },
      });

      try {
        const result = await get(metaFileName, 'string', {
          config,
          includeMetadata: true,
        });
        expect(result.error).toBeUndefined();
        expect(result.data?.body).toBe(testFileContent);
        expect(result.data?.metadata.contentType).toBe('text/plain');
        expect(result.data?.metadata.size).toBe(testFileContent.length);
        // Full reads: totalSize matches size (no Content-Range header).
        expect(result.data?.metadata.totalSize).toBe(testFileContent.length);
        expect(result.data?.metadata.etag).toMatch(/^".+"$/);
        expect(result.data?.metadata.modified).toBeInstanceOf(Date);
        expect(result.data?.metadata.userMetadata).toEqual({
          author: 'tigris',
        });
        expect(result.data?.metadata.contentRange).toBeUndefined();
      } finally {
        await remove(metaFileName, { config });
      }
    });

    it('should expose contentRange and totalSize when range + includeMetadata are combined', async () => {
      const result = await get(testFileName, 'string', {
        config,
        includeMetadata: true,
        range: { start: 0, end: 4 },
      });
      expect(result.error).toBeUndefined();
      expect(result.data?.body).toBe('Hello');
      // size is the partial body length…
      expect(result.data?.metadata.size).toBe(5);
      // …while totalSize is the full object size parsed from Content-Range.
      expect(result.data?.metadata.totalSize).toBe(testFileContent.length);
      expect(result.data?.metadata.contentRange).toMatch(/^bytes 0-4\/\d+$/);
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
      expect(result.data?.etag).toMatch(/^".+"$/);
    });

    it('should expose the same etag across put, head, and list', async () => {
      const etagFileName = `test-etag-${Date.now()}.txt`;

      const putResult = await put(etagFileName, testFileContent, { config });
      expect(putResult.error).toBeUndefined();
      // Guard against a vacuous comparison if put returned an empty etag.
      expect(putResult.data?.etag).toMatch(/^".+"$/);
      const expectedEtag = putResult.data?.etag;

      const headResult = await head(etagFileName, { config });
      expect(headResult.error).toBeUndefined();
      expect(headResult.data?.etag).toBe(expectedEtag);

      const listResult = await list({ prefix: etagFileName, config });
      expect(listResult.error).toBeUndefined();
      const listed = listResult.data?.items.find(
        (i) => i.name === etagFileName
      );
      expect(listed).toBeDefined();
      expect(listed?.etag).toBe(expectedEtag);

      await remove(etagFileName, { config });
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

      // Bucket listing is eventually consistent; give the gateway a moment to
      // surface the freshly created forks before the assertions run.
      await new Promise((resolve) => setTimeout(resolve, 10_000));
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
      expect(typeof fork?.name).toBe('string');
      expect(fork?.creationDate).toBeInstanceOf(Date);
    });

    it('should return an empty list when the source has no forks', async () => {
      const result = await listForks(unrelatedBucket, { config });

      expect(result.error).toBeUndefined();
      expect(result.data?.forks).toEqual([]);
    });

    it('should paginate forks using limit and paginationToken', async () => {
      const collected: string[] = [];
      let paginationToken: string | undefined;
      let pages = 0;

      do {
        const page = await listForks(sourceBucket, {
          config,
          limit: 1,
          paginationToken,
        });

        expect(page.error).toBeUndefined();
        expect(page.data).toBeDefined();
        // Each page must honour the requested limit.
        expect(page.data?.forks.length).toBeLessThanOrEqual(1);

        for (const fork of page.data?.forks ?? []) {
          collected.push(fork.name);
        }

        paginationToken = page.data?.paginationToken;
        pages += 1;
      } while (paginationToken && pages < 10);

      // With two forks and a page size of one, enumerating every fork
      // requires following the pagination token across multiple pages.
      expect(collected).toContain(forkA);
      expect(collected).toContain(forkB);
    });
  });

  describe('getSignedUploadUrl', () => {
    const createdKeys: string[] = [];

    afterEach(async () => {
      await Promise.all(createdKeys.map((k) => remove(k, { config })));
      createdKeys.length = 0;
    });

    it('returns a PUT contract by default and lets the client upload', async () => {
      const key = `test-signed-put-${Date.now()}.txt`;
      createdKeys.push(key);

      const signed = await getSignedUploadUrl(key, {
        config,
        contentType: 'text/plain',
      });
      expect(signed.error).toBeUndefined();
      expect(signed.data?.method).toBe('PUT');
      if (signed.data?.method !== 'PUT') return;
      expect(signed.data.url).toMatch(/^https:\/\//);
      expect(signed.data.headers?.['Content-Type']).toBe('text/plain');

      const res = await fetch(signed.data.url, {
        method: 'PUT',
        body: 'hello from put',
        headers: signed.data.headers,
      });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      const got = await get(key, 'string', { config });
      expect(got.data).toBe('hello from put');
    });

    it('returns a POST contract when a size bound is set', async () => {
      const key = `test-signed-post-${Date.now()}.txt`;
      createdKeys.push(key);
      const body = 'hello from post';

      const signed = await getSignedUploadUrl(key, {
        config,
        contentType: 'text/plain',
        maxSize: 1024,
      });
      expect(signed.error).toBeUndefined();
      expect(signed.data?.method).toBe('POST');
      if (signed.data?.method !== 'POST') return;
      expect(signed.data.url).toMatch(/^https:\/\//);
      expect(signed.data.fields.key).toBe(key);
      expect(signed.data.fields['Content-Type']).toBe('text/plain');

      const form = new FormData();
      for (const [k, v] of Object.entries(signed.data.fields)) {
        form.append(k, v);
      }
      form.append('file', new Blob([body], { type: 'text/plain' }), key);

      const res = await fetch(signed.data.url, { method: 'POST', body: form });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      const got = await get(key, 'string', { config });
      expect(got.data).toBe(body);
    });

    it('round-trips metadata via the PUT contract', async () => {
      const key = `test-signed-put-meta-${Date.now()}.txt`;
      createdKeys.push(key);

      const signed = await getSignedUploadUrl(key, {
        config,
        contentType: 'text/plain',
        metadata: { Author: 'tigris', 'Project-Id': 'abc-123' },
      });
      expect(signed.data?.method).toBe('PUT');
      if (signed.data?.method !== 'PUT') return;
      // Required headers — caller must send them verbatim or the signature
      // check fails. Keys are lowercased to match what HEAD returns.
      expect(signed.data.headers?.['x-amz-meta-author']).toBe('tigris');
      expect(signed.data.headers?.['x-amz-meta-project-id']).toBe('abc-123');

      const res = await fetch(signed.data.url, {
        method: 'PUT',
        body: 'meta via put',
        headers: signed.data.headers,
      });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      const headResult = await head(key, { config });
      expect(headResult.data?.metadata).toEqual({
        author: 'tigris',
        'project-id': 'abc-123',
      });
    });
  });

  describe('softDelete', () => {
    const ts = Date.now();
    const softDeleteBucket = `test-soft-delete-${ts}`.toLowerCase();
    const bucketsToCleanup: string[] = [];

    beforeAll(async () => {
      const created = await createBucket(softDeleteBucket, { config });
      expect(
        created.error,
        `soft-delete bucket create failed: ${created.error?.message}`
      ).toBeUndefined();
      bucketsToCleanup.push(softDeleteBucket);
    });

    afterAll(async () => {
      for (const bucket of bucketsToCleanup) {
        await removeBucket(bucket, { force: true, config });
      }
    });

    // Soft-delete settings are eventually consistent: a read immediately
    // after updateBucket can still report the previous state, so the
    // round-trip assertions poll getBucketInfo/listBuckets until the change
    // propagates rather than reading once.
    const POLL = { timeout: 15000, interval: 1000 };

    it('should enable soft delete and round-trip via getBucketInfo', async () => {
      const updated = await updateBucket(softDeleteBucket, {
        softDelete: { enabled: true, retentionDays: 7 },
        config,
      });
      expect(
        updated.error,
        `enable soft delete failed: ${updated.error?.message}`
      ).toBeUndefined();

      await expect
        .poll(async () => {
          const info = await getBucketInfo(softDeleteBucket, { config });
          return info.data?.settings.softDelete;
        }, POLL)
        .toEqual({ enabled: true, retentionDays: 7 });
    });

    it('should report enabled soft delete in listBuckets', async () => {
      // Ensure soft delete is enabled before listing.
      const updated = await updateBucket(softDeleteBucket, {
        softDelete: { enabled: true, retentionDays: 7 },
        config,
      });
      expect(updated.error).toBeUndefined();

      await expect
        .poll(async () => {
          const result = await listBuckets({ config });
          return result.data?.buckets.find((b) => b.name === softDeleteBucket)
            ?.softDeleteInfo;
        }, POLL)
        .toEqual({ enabled: true, retentionDays: 7 });
    });

    it('should disable soft delete and round-trip via getBucketInfo', async () => {
      const updated = await updateBucket(softDeleteBucket, {
        softDelete: { enabled: false },
        config,
      });
      expect(
        updated.error,
        `disable soft delete failed: ${updated.error?.message}`
      ).toBeUndefined();

      await expect
        .poll(async () => {
          const info = await getBucketInfo(softDeleteBucket, { config });
          return info.data?.settings.softDelete;
        }, POLL)
        .toEqual({ enabled: false });
    });

    it('should list a soft-deleted bucket only when deleted is true', async () => {
      const deletedBucket = `test-soft-deleted-${ts}`.toLowerCase();
      bucketsToCleanup.push(deletedBucket);

      const created = await createBucket(deletedBucket, { config });
      expect(created.error).toBeUndefined();

      const enabled = await updateBucket(deletedBucket, {
        softDelete: { enabled: true, retentionDays: 7 },
        config,
      });
      expect(enabled.error).toBeUndefined();

      // Soft delete (no force) so the bucket is recoverable, not purged.
      const removed = await removeBucket(deletedBucket, { config });
      expect(
        removed.error,
        `soft delete failed: ${removed.error?.message}`
      ).toBeUndefined();

      // It should appear when listing deleted buckets...
      await expect
        .poll(async () => {
          const result = await listBuckets({ deleted: true, config });
          return result.data?.buckets.map((b) => b.name) ?? [];
        }, POLL)
        .toContain(deletedBucket);

      // ...and be absent from the default (live-only) listing.
      await expect
        .poll(async () => {
          const result = await listBuckets({ config });
          return result.data?.buckets.map((b) => b.name) ?? [];
        }, POLL)
        .not.toContain(deletedBucket);
    });

    it('should restore a soft-deleted bucket', async () => {
      const bucket = `test-soft-restore-${ts}`.toLowerCase();
      bucketsToCleanup.push(bucket);

      const created = await createBucket(bucket, { config });
      expect(created.error).toBeUndefined();

      const enabled = await updateBucket(bucket, {
        softDelete: { enabled: true, retentionDays: 7 },
        config,
      });
      expect(enabled.error).toBeUndefined();

      // Soft delete (no force) so the bucket can be restored.
      const removed = await removeBucket(bucket, { config });
      expect(
        removed.error,
        `soft delete failed: ${removed.error?.message}`
      ).toBeUndefined();

      await expect
        .poll(async () => {
          const result = await listBuckets({ deleted: true, config });
          return result.data?.buckets.map((b) => b.name) ?? [];
        }, POLL)
        .toContain(bucket);

      const restored = await restoreBucket(bucket, { config });
      expect(
        restored.error,
        `restore failed: ${restored.error?.message}`
      ).toBeUndefined();
      expect(restored.data).toEqual({ bucket, restored: true });

      // It should return to the live listing...
      await expect
        .poll(async () => {
          const result = await listBuckets({ config });
          return result.data?.buckets.map((b) => b.name) ?? [];
        }, POLL)
        .toContain(bucket);

      // ...and no longer appear among deleted buckets.
      await expect
        .poll(async () => {
          const result = await listBuckets({ deleted: true, config });
          return result.data?.buckets.map((b) => b.name) ?? [];
        }, POLL)
        .not.toContain(bucket);
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
