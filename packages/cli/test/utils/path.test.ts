import { describe, it, expect } from 'vitest';
import {
  parsePath,
  parsePaths,
  isRemotePath,
  parseRemotePath,
  globToRegex,
  wildcardPrefix,
} from '../../src/utils/path.js';

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

describe('isRemotePath', () => {
  it('should return true for t3:// prefixed paths', () => {
    expect(isRemotePath('t3://my-bucket')).toBe(true);
    expect(isRemotePath('t3://my-bucket/file.txt')).toBe(true);
    expect(isRemotePath('t3://my-bucket/folder/')).toBe(true);
  });

  it('should return true for tigris:// prefixed paths', () => {
    expect(isRemotePath('tigris://my-bucket')).toBe(true);
    expect(isRemotePath('tigris://my-bucket/file.txt')).toBe(true);
    expect(isRemotePath('tigris://my-bucket/folder/')).toBe(true);
  });

  it('should return false for bare paths', () => {
    expect(isRemotePath('my-bucket')).toBe(false);
    expect(isRemotePath('./file.txt')).toBe(false);
    expect(isRemotePath('/absolute/path')).toBe(false);
    expect(isRemotePath('../relative')).toBe(false);
    expect(isRemotePath('')).toBe(false);
  });

  it('should return false for similar but incorrect prefixes', () => {
    expect(isRemotePath('t3:/bucket')).toBe(false);
    expect(isRemotePath('T3://bucket')).toBe(false);
    expect(isRemotePath('s3://bucket')).toBe(false);
    expect(isRemotePath('Tigris://bucket')).toBe(false);
    expect(isRemotePath('tigris:/bucket')).toBe(false);
  });
});

describe('parseRemotePath', () => {
  it('should strip t3:// and parse bucket-only path', () => {
    const result = parseRemotePath('t3://my-bucket');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('');
  });

  it('should strip t3:// and parse bucket with key', () => {
    const result = parseRemotePath('t3://my-bucket/file.txt');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('file.txt');
  });

  it('should strip t3:// and parse nested path', () => {
    const result = parseRemotePath('t3://my-bucket/folder/subfolder/file.txt');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/subfolder/file.txt');
  });

  it('should handle trailing slash after t3:// strip', () => {
    const result = parseRemotePath('t3://my-bucket/folder/');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/');
  });

  it('should strip tigris:// and parse bucket-only path', () => {
    const result = parseRemotePath('tigris://my-bucket');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('');
  });

  it('should strip tigris:// and parse bucket with key', () => {
    const result = parseRemotePath('tigris://my-bucket/folder/file.txt');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/file.txt');
  });

  it('should handle wildcard paths after t3:// strip', () => {
    const result = parseRemotePath('t3://my-bucket/folder/*');
    expect(result.bucket).toBe('my-bucket');
    expect(result.path).toBe('folder/*');
  });
});

describe('globToRegex', () => {
  it('should match simple wildcard', () => {
    const regex = globToRegex('*');
    expect(regex.test('file.txt')).toBe(true);
    expect(regex.test('photo.jpg')).toBe(true);
    expect(regex.test('')).toBe(true);
  });

  it('should not match across slashes', () => {
    const regex = globToRegex('*');
    expect(regex.test('folder/file.txt')).toBe(false);
  });

  it('should match wildcard with extension', () => {
    const regex = globToRegex('*.txt');
    expect(regex.test('file.txt')).toBe(true);
    expect(regex.test('notes.txt')).toBe(true);
    expect(regex.test('file.jpg')).toBe(false);
    expect(regex.test('file.txt.bak')).toBe(false);
    expect(regex.test('folder/file.txt')).toBe(false);
  });

  it('should match wildcard with prefix', () => {
    const regex = globToRegex('img_*');
    expect(regex.test('img_001.jpg')).toBe(true);
    expect(regex.test('img_')).toBe(true);
    expect(regex.test('photo_001.jpg')).toBe(false);
  });

  it('should match wildcard with prefix and extension', () => {
    const regex = globToRegex('data_*.csv');
    expect(regex.test('data_2024.csv')).toBe(true);
    expect(regex.test('data_.csv')).toBe(true);
    expect(regex.test('data_2024.txt')).toBe(false);
    expect(regex.test('other_2024.csv')).toBe(false);
  });

  it('should escape regex metacharacters', () => {
    const regex = globToRegex('file(1).txt');
    expect(regex.test('file(1).txt')).toBe(true);
    expect(regex.test('file1.txt')).toBe(false);
  });

  it('should escape dots', () => {
    const regex = globToRegex('*.tar.gz');
    expect(regex.test('archive.tar.gz')).toBe(true);
    expect(regex.test('archivetargz')).toBe(false);
  });

  it('should escape square brackets', () => {
    const regex = globToRegex('file[1].txt');
    expect(regex.test('file[1].txt')).toBe(true);
    expect(regex.test('file1.txt')).toBe(false);
  });

  it('should escape plus and question mark', () => {
    const regex = globToRegex('file+name?.txt');
    expect(regex.test('file+name?.txt')).toBe(true);
    expect(regex.test('fileename.txt')).toBe(false);
  });

  it('should handle exact match with no wildcard', () => {
    const regex = globToRegex('exact-file.txt');
    expect(regex.test('exact-file.txt')).toBe(true);
    expect(regex.test('other-file.txt')).toBe(false);
    expect(regex.test('exact-file.txt.bak')).toBe(false);
  });

  it('should handle multiple wildcards', () => {
    const regex = globToRegex('*_backup_*');
    expect(regex.test('db_backup_2024')).toBe(true);
    expect(regex.test('_backup_')).toBe(true);
    expect(regex.test('folder/db_backup_2024')).toBe(false);
  });
});

describe('wildcardPrefix', () => {
  it('should return folder prefix for folder/*.txt', () => {
    expect(wildcardPrefix('folder/*.txt')).toBe('folder/');
  });

  it('should return empty string for *.txt', () => {
    expect(wildcardPrefix('*.txt')).toBe('');
  });

  it('should return nested prefix for a/b/*.txt', () => {
    expect(wildcardPrefix('a/b/*.txt')).toBe('a/b/');
  });

  it('should return prefix for a/b/*', () => {
    expect(wildcardPrefix('a/b/*')).toBe('a/b/');
  });

  it('should return empty string for *', () => {
    expect(wildcardPrefix('*')).toBe('');
  });

  it('should handle prefix with star mid-name', () => {
    expect(wildcardPrefix('folder/img_*')).toBe('folder/');
  });

  it('should handle deeply nested paths', () => {
    expect(wildcardPrefix('a/b/c/d/*.log')).toBe('a/b/c/d/');
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
