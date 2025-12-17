import { describe, it, expect } from 'vitest';
import { parsePath, parsePaths } from '../../src/utils/path.js';

describe('parsePath', () => {
  it('should parse bucket-only path', () => {
    const result = parsePath('my-bucket');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('');
  });

  it('should parse bucket with single path segment', () => {
    const result = parsePath('my-bucket/file.txt');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('file.txt');
  });

  it('should parse bucket with nested path', () => {
    const result = parsePath('my-bucket/folder/subfolder/file.txt');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/subfolder/file.txt');
  });

  it('should handle folder path with trailing slash', () => {
    const result = parsePath('my-bucket/folder/');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/');
  });

  it('should handle wildcard paths', () => {
    const result = parsePath('my-bucket/folder/*');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/*');
  });

  it('should handle empty string', () => {
    const result = parsePath('');
    expect(result.bucket).toBe('');
    expect(result.path).toBe('');
  });
});

describe('parsePaths', () => {
  it('should parse source and destination paths', () => {
    const result = parsePaths(
      'src-bucket/file.txt',
      'dest-bucket/new-file.txt'
    );
    expect(result.source.bucket).toBe('src-bucket');
    expect(result.source.path).toBe('file.txt');
    expect(result.destination.bucket).toBe('dest-bucket');
    expect(result.destination.path).toBe('new-file.txt');
  });

  it('should handle cross-bucket copy with same filename', () => {
    const result = parsePaths('bucket-a/folder/file.txt', 'bucket-b');
    expect(result.source.bucket).toBe('bucket-a');
    expect(result.source.path).toBe('folder/file.txt');
    expect(result.destination.bucket).toBe('bucket-b');
    expect(result.destination.path).toBe('');
  });
});

// Note: isPathFolder and listAllItems require mocking @tigrisdata/storage
// These are tested indirectly through CLI integration tests
describe('path utilities edge cases', () => {
  it('should handle paths with special characters', () => {
    const result = parsePath('my-bucket/folder/file with spaces.txt');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/file with spaces.txt');
  });

  it('should handle paths with multiple slashes', () => {
    const result = parsePath('bucket/a/b/c/d/e/f.txt');
    expect(result.bucket).toBe('bucket');
    expect(result.path).toBe('a/b/c/d/e/f.txt');
  });

  it('should handle bucket names with dashes and numbers', () => {
    const result = parsePath('my-bucket-123/file.txt');
    expect(result.bucket).toBe('my-bucket-123');
    expect(result.path).toBe('file.txt');
  });

  it('should handle paths with dots', () => {
    const result = parsePath('bucket/folder.name/file.tar.gz');
    expect(result.bucket).toBe('bucket');
    expect(result.path).toBe('folder.name/file.tar.gz');
  });
});
