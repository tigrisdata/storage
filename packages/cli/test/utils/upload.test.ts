import { describe, expect, it } from 'vitest';

import { calculateUploadParams } from '../../src/utils/upload.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const DEFAULT_PART_SIZE = 5 * MB;

describe('calculateUploadParams', () => {
  it.each([
    { fileSize: undefined, label: 'undefined' },
    { fileSize: 0, label: '0' },
    { fileSize: 1, label: '1 byte' },
    { fileSize: DEFAULT_PART_SIZE, label: '5 MB (exactly)' },
  ])('returns { multipart: false } when fileSize is $label', ({ fileSize }) => {
    expect(calculateUploadParams(fileSize)).toEqual({ multipart: false });
  });

  it('returns multipart config when fileSize exceeds 5 MB', () => {
    const result = calculateUploadParams(DEFAULT_PART_SIZE + 1);
    expect(result).toEqual({
      multipart: true,
      partSize: DEFAULT_PART_SIZE,
      queueSize: 10,
    });
  });

  it('keeps default partSize for files under 50 GB', () => {
    const result = calculateUploadParams(10 * GB);
    expect(result).toEqual({
      multipart: true,
      partSize: DEFAULT_PART_SIZE,
      queueSize: 10,
    });
  });

  it('recalculates partSize when file exceeds MAX_PARTS * DEFAULT_PART_SIZE', () => {
    const fileSize = DEFAULT_PART_SIZE * 10_000 + 1; // just over 50 GB
    const result = calculateUploadParams(fileSize);
    expect(result.multipart).toBe(true);
    if (result.multipart) {
      expect(result.partSize).toBe(Math.ceil(fileSize / 10_000));
      expect(result.partSize).toBeGreaterThan(DEFAULT_PART_SIZE);
      expect(result.queueSize).toBe(10);
    }
  });

  it('handles very large files (1 TB)', () => {
    const fileSize = 1024 * GB;
    const result = calculateUploadParams(fileSize);
    expect(result.multipart).toBe(true);
    if (result.multipart) {
      expect(result.partSize).toBe(Math.ceil(fileSize / 10_000));
      // Verify we stay within S3 part limit
      expect(Math.ceil(fileSize / result.partSize)).toBeLessThanOrEqual(10_000);
    }
  });
});
