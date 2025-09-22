import { useState, useCallback } from 'react';
import type { UploadState, UploadOptions } from '../types';

export function useUpload() {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: null,
    error: null,
    url: null,
  });

  const uploadFile = useCallback(
    async (file: File, options?: UploadOptions) => {
      setUploadState({
        isUploading: true,
        progress: { loaded: 0, total: file.size, percentage: 0 },
        error: null,
        url: null,
      });

      try {
        // TODO: Implement actual upload logic using @tigrisdata/storage
        // This is a placeholder implementation
        await new Promise((resolve) => {
          let loaded = 0;
          const total = file.size;

          const interval = setInterval(() => {
            loaded += Math.random() * (total / 10);
            if (loaded >= total) {
              loaded = total;
              clearInterval(interval);

              const mockUrl = `https://storage.tigrisdata.com/${file.name}`;
              setUploadState({
                isUploading: false,
                progress: { loaded, total, percentage: 100 },
                error: null,
                url: mockUrl,
              });

              options?.onSuccess?.(mockUrl);
              resolve(mockUrl);
            } else {
              const percentage = Math.round((loaded / total) * 100);
              const progress = { loaded, total, percentage };

              setUploadState((prev) => ({
                ...prev,
                progress,
              }));

              options?.onProgress?.(progress);
            }
          }, 100);
        });
      } catch (error) {
        const uploadError =
          error instanceof Error ? error : new Error('Upload failed');
        setUploadState({
          isUploading: false,
          progress: null,
          error: uploadError,
          url: null,
        });
        options?.onError?.(uploadError);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: null,
      error: null,
      url: null,
    });
  }, []);

  return {
    ...uploadState,
    uploadFile,
    reset,
  };
}
