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

  it('should add all files as pending immediately when uploading multiple', async () => {
    let resolveUpload: (() => void) | undefined;

    vi.mocked(mockUpload).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveUpload = () => resolve({ data: { name: 'test.txt', url: '', size: 0, modified: new Date() } });
      });
    });

    const files = Array.from({ length: 4 }, (_, i) =>
      new File([`content${i}`], `file${i}.txt`, { type: 'text/plain' })
    );

    const { result } = renderHook(() => useUpload({ url: mockUrl, concurrency: 1 }));

    let uploadPromise: Promise<unknown>;
    act(() => {
      uploadPromise = result.current.uploadMultiple(files);
    });

    // All files should be in the uploads map immediately
    expect(result.current.uploads.size).toBe(4);

    // Check that files not yet started are pending
    const states = Array.from(result.current.uploads.values());
    const pendingFiles = states.filter((s) => s.status === 'pending');
    const uploadingFiles = states.filter((s) => s.status === 'uploading');

    // With concurrency 1, only 1 should be uploading, rest pending
    expect(uploadingFiles.length).toBe(1);
    expect(pendingFiles.length).toBe(3);

    // Cleanup: resolve all uploads
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        resolveUpload?.();
        await new Promise((r) => setTimeout(r, 0));
      }
      await uploadPromise!;
    });
  });

  it('should transition files from pending to uploading to success', async () => {
    const uploadResolvers: (() => void)[] = [];

    vi.mocked(mockUpload).mockImplementation(() => {
      return new Promise((resolve) => {
        uploadResolvers.push(() => resolve({ data: { name: 'test.txt', url: '', size: 0, modified: new Date() } }));
      });
    });

    const files = [
      new File(['content1'], 'file1.txt', { type: 'text/plain' }),
      new File(['content2'], 'file2.txt', { type: 'text/plain' }),
    ];

    const { result } = renderHook(() => useUpload({ url: mockUrl, concurrency: 1 }));

    let uploadPromise: Promise<unknown>;
    act(() => {
      uploadPromise = result.current.uploadMultiple(files);
    });

    // Initially: 1 uploading, 1 pending
    let states = Array.from(result.current.uploads.values());
    expect(states.find((s) => s.file.name === 'file1.txt')?.status).toBe('uploading');
    expect(states.find((s) => s.file.name === 'file2.txt')?.status).toBe('pending');

    // Complete first upload
    await act(async () => {
      uploadResolvers[0]();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Now: 1 success, 1 uploading
    states = Array.from(result.current.uploads.values());
    expect(states.find((s) => s.file.name === 'file1.txt')?.status).toBe('success');
    expect(states.find((s) => s.file.name === 'file2.txt')?.status).toBe('uploading');

    // Complete second upload
    await act(async () => {
      uploadResolvers[1]();
      await uploadPromise!;
    });

    // Now: both success
    states = Array.from(result.current.uploads.values());
    expect(states.find((s) => s.file.name === 'file1.txt')?.status).toBe('success');
    expect(states.find((s) => s.file.name === 'file2.txt')?.status).toBe('success');
  });
});
