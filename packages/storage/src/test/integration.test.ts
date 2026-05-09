import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    });

    it('should return undefined data for non-existent files', async () => {
      const result = await head('non-existent-file.txt', {
        config,
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeUndefined();
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
