import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockComplete = vi.fn();
vi.mock('../object/multipart', () => ({
  completeMultipartUpload: (...args: unknown[]) => mockComplete(...args),
  getPartsPresignedUrls: vi.fn(),
  initMultipartUpload: vi.fn(),
}));

import { handleClientUpload } from './server';
import { UploadAction } from './shared';

const request = {
  action: UploadAction.MultipartComplete,
  name: 'a.txt',
  uploadId: 'up-1',
  partIds: [{ 1: '"etag"' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockComplete.mockResolvedValue({ data: { path: 'a.txt', url: '' } });
});

describe('handleClientUpload multipart-complete', () => {
  it('passes allowOverwrite: false through to the completion', async () => {
    await handleClientUpload({ ...request, allowOverwrite: false });

    expect(mockComplete).toHaveBeenCalledWith(
      'a.txt',
      'up-1',
      request.partIds,
      expect.objectContaining({ allowOverwrite: false })
    );
  });

  it('allows overwrite when the client does not ask otherwise', async () => {
    await handleClientUpload(request);

    expect(mockComplete).toHaveBeenCalledWith(
      'a.txt',
      'up-1',
      request.partIds,
      expect.objectContaining({ allowOverwrite: true })
    );
  });

  it('keeps the error message when the result is sent as JSON', async () => {
    mockComplete.mockResolvedValue({ error: new Error('File already exists') });

    const result = await handleClientUpload({
      ...request,
      allowOverwrite: false,
    });

    expect(result.error).toBeInstanceOf(Error);
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      error: { name: 'Error', message: 'File already exists' },
    });
  });
});
