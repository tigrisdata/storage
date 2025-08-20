import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { put } from '../lib/put';
import { get } from '../lib/get';
import { head } from '../lib/head';
import { list } from '../lib/list';
import { remove } from '../lib/remove';
import { shouldSkipIntegrationTests } from './setup';
import { config } from '../lib/config';

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
        allowOverwrite: true,
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe(testFileName);
      expect(result.data?.size).toBeGreaterThan(0);
      expect(result.data?.url).toBeDefined();
      expect(result.data?.modified).toBeInstanceOf(Date);
    });

    it('should prevent overwriting by default', async () => {
      // First upload
      await put(testFileName, testFileContent, {
        config,
        allowOverwrite: true,
      });

      // Second upload without allowOverwrite
      const result = await put(testFileName, 'new content', {
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
        allowOverwrite: true,
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
        allowOverwrite: true,
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
        allowOverwrite: true,
      });
    });

    it('should retrieve file metadata', async () => {
      const result = await head(testFileName, { config });

      expect(result).toBeDefined();
      expect(result?.data?.size).toBeGreaterThan(0);
      expect(result?.data?.modified).toBeInstanceOf(Date);
      expect(result?.data?.path).toBe(testFileName);
    });

    it('should return undefined for non-existent files', async () => {
      const result = await head('non-existent-file.txt', {
        config,
      });

      expect(result).toBeUndefined();
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
            allowOverwrite: true,
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
        allowOverwrite: true,
      });
    });

    it('should delete a file successfully', async () => {
      const result = await remove(testFileName, { config });

      // remove returns void on success, undefined means success
      expect(result).toBeUndefined();

      // Verify file is gone
      const headResult = await head(testFileName, { config });
      expect(headResult).toBeUndefined();
    });

    it('should handle non-existent files gracefully', async () => {
      const result = await remove('non-existent-file.txt', {
        config,
      });

      // Should succeed silently for non-existent files
      expect(result).toBeUndefined();
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
        allowOverwrite: true,
      });
      expect(putResult.error).toBeUndefined();

      // Verify metadata
      const headResult = await head(fileName, { config });
      expect(headResult?.data?.size).toBeGreaterThan(0);

      // Download and verify content
      const getResult = await get(fileName, 'string', { config });
      expect(getResult.error).toBeUndefined();
      expect(getResult.data).toBe(content);

      // Delete
      const removeResult = await remove(fileName, { config });
      expect(removeResult).toBeUndefined();

      // Verify deletion
      const finalHeadResult = await head(fileName, { config });
      expect(finalHeadResult).toBeUndefined();
    });
  });
});
