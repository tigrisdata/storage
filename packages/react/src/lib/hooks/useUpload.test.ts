import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUpload } from './useUpload';

// Mock the storage client
vi.mock('@tigrisdata/storage/client', () => ({
  upload: vi.fn(),
}));

import { upload as mockUpload } from '@tigrisdata/storage/client';

describe('useUpload', () => {
  const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
  const mockUrl = '/api/upload';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty uploads and not uploading', () => {
    const { result } = renderHook(() => useUpload({ url: mockUrl }));

    expect(result.current.uploads.size).toBe(0);
    expect(result.current.isUploading).toBe(false);
  });

  it('should upload a file successfully', async () => {
    const mockResponse = {
      name: 'test.txt',
      url: 'https://example.com/test.txt',
      size: 12,
      modified: new Date(),
    };

    vi.mocked(mockUpload).mockResolvedValue({ data: mockResponse });

    const onUploadComplete = vi.fn();
    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, onUploadComplete })
    );

    await act(async () => {
      await result.current.upload(mockFile);
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'test.txt',
      mockFile,
      expect.objectContaining({
        url: mockUrl,
        multipart: false,
      })
    );
    expect(onUploadComplete).toHaveBeenCalledWith(mockFile, mockResponse);
  });

  it('should handle upload error', async () => {
    const mockError = new Error('Upload failed');
    vi.mocked(mockUpload).mockResolvedValue({ error: mockError });

    const onUploadError = vi.fn();
    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, onUploadError })
    );

    await act(async () => {
      await result.current.upload(mockFile);
    });

    expect(onUploadError).toHaveBeenCalledWith(mockFile, mockError);

    const uploadState = Array.from(result.current.uploads.values())[0];
    expect(uploadState.status).toBe('error');
    expect(uploadState.error).toBe(mockError);
  });

  it('should call onUploadStart when upload begins', async () => {
    vi.mocked(mockUpload).mockResolvedValue({
      data: { name: 'test.txt', url: '', size: 0, modified: new Date() },
    });

    const onUploadStart = vi.fn();
    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, onUploadStart })
    );

    await act(async () => {
      await result.current.upload(mockFile);
    });

    expect(onUploadStart).toHaveBeenCalledWith(mockFile);
  });

  it('should enable multipart when file exceeds threshold', async () => {
    vi.mocked(mockUpload).mockResolvedValue({
      data: { name: 'test.txt', url: '', size: 0, modified: new Date() },
    });

    const largeFile = new File(['x'.repeat(1000)], 'large.txt', { type: 'text/plain' });
    Object.defineProperty(largeFile, 'size', { value: 20 * 1024 * 1024 }); // 20MB

    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, multipartThreshold: 10 * 1024 * 1024 }) // 10MB threshold
    );

    await act(async () => {
      await result.current.upload(largeFile);
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'large.txt',
      largeFile,
      expect.objectContaining({
        multipart: true,
      })
    );
  });

  it('should upload multiple files', async () => {
    vi.mocked(mockUpload).mockResolvedValue({
      data: { name: 'test.txt', url: '', size: 0, modified: new Date() },
    });

    const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
    const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' });

    const { result } = renderHook(() => useUpload({ url: mockUrl }));

    await act(async () => {
      await result.current.uploadMultiple([file1, file2]);
    });

    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('should reset uploads', async () => {
    vi.mocked(mockUpload).mockResolvedValue({
      data: { name: 'test.txt', url: '', size: 0, modified: new Date() },
    });

    const { result } = renderHook(() => useUpload({ url: mockUrl }));

    await act(async () => {
      await result.current.upload(mockFile);
    });

    expect(result.current.uploads.size).toBe(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.uploads.size).toBe(0);
  });

  it('should track upload progress', async () => {
    let progressCallback: ((progress: { loaded: number; total: number; percentage: number }) => void) | undefined;

    vi.mocked(mockUpload).mockImplementation(async (_name, _data, options) => {
      progressCallback = options?.onUploadProgress;
      return { data: { name: 'test.txt', url: '', size: 0, modified: new Date() } };
    });

    const onUploadProgress = vi.fn();
    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, onUploadProgress })
    );

    await act(async () => {
      const uploadPromise = result.current.upload(mockFile);

      // Simulate progress callback
      if (progressCallback) {
        progressCallback({ loaded: 50, total: 100, percentage: 50 });
      }

      await uploadPromise;
    });

    expect(onUploadProgress).toHaveBeenCalledWith(mockFile, {
      loaded: 50,
      total: 100,
      percentage: 50,
    });
  });

  it('should pass partSize to storage client', async () => {
    vi.mocked(mockUpload).mockResolvedValue({
      data: { name: 'test.txt', url: '', size: 0, modified: new Date() },
    });

    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, multipart: true, partSize: 10 * 1024 * 1024 })
    );

    await act(async () => {
      await result.current.upload(mockFile);
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'test.txt',
      mockFile,
      expect.objectContaining({
        multipart: true,
        partSize: 10 * 1024 * 1024,
      })
    );
  });

  it('should pass concurrency to storage client', async () => {
    vi.mocked(mockUpload).mockResolvedValue({
      data: { name: 'test.txt', url: '', size: 0, modified: new Date() },
    });

    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, concurrency: 2 })
    );

    await act(async () => {
      await result.current.upload(mockFile);
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'test.txt',
      mockFile,
      expect.objectContaining({
        concurrency: 2,
      })
    );
  });

  it('should respect concurrency limit when uploading multiple files', async () => {
    let activeUploads = 0;
    let maxConcurrentUploads = 0;

    vi.mocked(mockUpload).mockImplementation(async () => {
      activeUploads++;
      maxConcurrentUploads = Math.max(maxConcurrentUploads, activeUploads);

      // Simulate upload delay
      await new Promise((resolve) => setTimeout(resolve, 10));

      activeUploads--;
      return { data: { name: 'test.txt', url: '', size: 0, modified: new Date() } };
    });

    const files = Array.from({ length: 6 }, (_, i) =>
      new File([`content${i}`], `file${i}.txt`, { type: 'text/plain' })
    );

    const { result } = renderHook(() =>
      useUpload({ url: mockUrl, concurrency: 2 })
    );

    await act(async () => {
      await result.current.uploadMultiple(files);
    });

    expect(mockUpload).toHaveBeenCalledTimes(6);
    expect(maxConcurrentUploads).toBeLessThanOrEqual(2);
  });

  it('should use default concurrency of 4 when not specified', async () => {
    let activeUploads = 0;
    let maxConcurrentUploads = 0;

    vi.mocked(mockUpload).mockImplementation(async () => {
      activeUploads++;
      maxConcurrentUploads = Math.max(maxConcurrentUploads, activeUploads);

      await new Promise((resolve) => setTimeout(resolve, 10));

      activeUploads--;
      return { data: { name: 'test.txt', url: '', size: 0, modified: new Date() } };
    });

    const files = Array.from({ length: 8 }, (_, i) =>
      new File([`content${i}`], `file${i}.txt`, { type: 'text/plain' })
    );

    const { result } = renderHook(() => useUpload({ url: mockUrl }));

    await act(async () => {
      await result.current.uploadMultiple(files);
    });

    expect(mockUpload).toHaveBeenCalledTimes(8);
    expect(maxConcurrentUploads).toBeLessThanOrEqual(4);
  });
});
