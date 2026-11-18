import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BucketMigration } from '../types';
import { setBucketMigration } from './migration';

const mockSetBucketSettings = vi.fn();
vi.mock('./set', () => ({
  setBucketSettings: (...args: unknown[]) => mockSetBucketSettings(...args),
}));

const source: BucketMigration = {
  enabled: true,
  accessKey: 'AKIA',
  secretKey: 'secret',
  region: 'us-east-1',
  name: 'source-bucket',
  endpoint: 'https://s3.amazonaws.com',
};

const sentShadowBucket = () =>
  mockSetBucketSettings.mock.calls[0][1].body.shadow_bucket;

beforeEach(() => {
  vi.clearAllMocks();
  mockSetBucketSettings.mockResolvedValue({
    data: { bucket: 'my-bucket', updated: true },
  });
});

describe('setBucketMigration skip patterns', () => {
  it('sends skip patterns with the rest of the shadow config', async () => {
    const result = await setBucketMigration('my-bucket', {
      dataMigration: {
        ...source,
        writeThrough: true,
        skipPatterns: ['tmp/*', '*.tmp', 'manifest.json'],
      },
    });

    expect(result.error).toBeUndefined();
    expect(sentShadowBucket()).toEqual({
      access_key: 'AKIA',
      secret_key: 'secret',
      region: 'us-east-1',
      name: 'source-bucket',
      endpoint: 'https://s3.amazonaws.com',
      write_through: true,
      skip_patterns: ['tmp/*', '*.tmp', 'manifest.json'],
    });
  });

  it('omits skip_patterns when none are given', async () => {
    await setBucketMigration('my-bucket', { dataMigration: source });
    expect(sentShadowBucket()).not.toHaveProperty('skip_patterns');
  });

  it('sends an empty list to clear skip patterns', async () => {
    await setBucketMigration('my-bucket', {
      dataMigration: { ...source, skipPatterns: [] },
    });
    expect(sentShadowBucket().skip_patterns).toEqual([]);
  });

  it.each([
    [
      'more than 32 patterns',
      Array.from({ length: 33 }, (_, i) => `p${i}/*`),
      'At most 32 skip patterns are allowed',
    ],
    ['an empty pattern', [''], 'Skip patterns must be 1 to 512 bytes'],
    [
      'a pattern over 512 bytes',
      // 171 three-byte characters = 513 bytes, though only 171 characters.
      ['€'.repeat(171)],
      'Skip patterns must be 1 to 512 bytes',
    ],
    [
      'a line break',
      ['tmp/\n*'],
      'Skip patterns cannot contain NUL or line break characters',
    ],
    ['a match-all pattern', ['*'], 'would match every object'],
    ['a match-all pattern with slashes', ['/*/**'], 'would match every object'],
  ])(
    'rejects %s without sending a request',
    async (_, skipPatterns, message) => {
      const result = await setBucketMigration('my-bucket', {
        dataMigration: { ...source, skipPatterns },
      });

      expect(result.error?.message).toContain(message);
      expect(mockSetBucketSettings).not.toHaveBeenCalled();
    }
  );

  it('accepts exactly 32 patterns of 512 bytes', async () => {
    const result = await setBucketMigration('my-bucket', {
      dataMigration: {
        ...source,
        skipPatterns: Array.from(
          { length: 32 },
          (_, i) => `${String(i).padStart(2, '0')}${'a'.repeat(510)}`
        ),
      },
    });

    expect(result.error).toBeUndefined();
    expect(mockSetBucketSettings).toHaveBeenCalledOnce();
  });
});
