import { useState, useCallback, useRef } from 'react';
import { upload as storageUpload } from '@tigrisdata/storage/client';
import { executeWithConcurrency } from '@shared/utils';
import type {
  UseUploadOptions,
  UseUploadReturn,
  FileUploadState,
  UploadProgress,
} from '../types';

function generateFileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const {
    url,
    multipart,
    partSize,
    multipartThreshold,
    concurrency,
    uploadOptions,
    onUploadStart,
    onUploadProgress,
    onUploadComplete,
    onUploadError,
  } = options;

  const [uploads, setUploads] = useState<Map<string, FileUploadState>>(new Map());
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const updateUpload = useCallback((key: string, update: Partial<FileUploadState>) => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key);
      if (existing) {
        newMap.set(key, { ...existing, ...update });
      }
      return newMap;
    });
  }, []);

  const startUpload = useCallback(
    async (file: File) => {
      const key = generateFileKey(file);

      // Set status to uploading (file should already be in pending state for multiple uploads)
      updateUpload(key, { status: 'uploading' });
      onUploadStart?.(file);

      // Determine if multipart should be used
      const useMultipart = multipart || (multipartThreshold !== undefined && file.size > multipartThreshold);

      const result = await storageUpload(file.name, file, {
        ...uploadOptions,
        url,
        multipart: useMultipart,
        partSize,
        concurrency,
        onUploadProgress: (progress: UploadProgress) => {
          updateUpload(key, { progress });
          onUploadProgress?.(file, progress);
        },
      });

      if (result.error) {
        const error = result.error instanceof Error ? result.error : new Error(String(result.error));
        updateUpload(key, { status: 'error', error });
        onUploadError?.(file, error);
        return undefined;
      }

      updateUpload(key, {
        status: 'success',
        response: result.data,
        progress: { loaded: file.size, total: file.size, percentage: 100 },
      });
      onUploadComplete?.(file, result.data);
      return result.data;
    },
    [url, multipart, partSize, multipartThreshold, concurrency, uploadOptions, onUploadStart, onUploadProgress, onUploadComplete, onUploadError, updateUpload]
  );

  const upload = useCallback(
    async (file: File) => {
      const key = generateFileKey(file);

      // Add file to state immediately
      const initialState: FileUploadState = {
        file,
        status: 'uploading',
        progress: { loaded: 0, total: file.size, percentage: 0 },
      };

      setUploads((prev) => {
        const newMap = new Map(prev);
        newMap.set(key, initialState);
        return newMap;
      });

      onUploadStart?.(file);

      // Determine if multipart should be used
      const useMultipart = multipart || (multipartThreshold !== undefined && file.size > multipartThreshold);

      const result = await storageUpload(file.name, file, {
        ...uploadOptions,
        url,
        multipart: useMultipart,
        partSize,
        concurrency,
        onUploadProgress: (progress: UploadProgress) => {
          updateUpload(key, { progress });
          onUploadProgress?.(file, progress);
        },
      });

      if (result.error) {
        const error = result.error instanceof Error ? result.error : new Error(String(result.error));
        updateUpload(key, { status: 'error', error });
        onUploadError?.(file, error);
        return undefined;
      }

      updateUpload(key, {
        status: 'success',
        response: result.data,
        progress: { loaded: file.size, total: file.size, percentage: 100 },
      });
      onUploadComplete?.(file, result.data);
      return result.data;
    },
    [url, multipart, partSize, multipartThreshold, concurrency, uploadOptions, onUploadStart, onUploadProgress, onUploadComplete, onUploadError, updateUpload]
  );

  const uploadMultiple = useCallback(
    async (files: File[]) => {
      // Add all files to state immediately as pending
      setUploads((prev) => {
        const newMap = new Map(prev);
        for (const file of files) {
          const key = generateFileKey(file);
          newMap.set(key, {
            file,
            status: 'pending',
            progress: { loaded: 0, total: file.size, percentage: 0 },
          });
        }
        return newMap;
      });

      // Start uploads with concurrency limit
      const limit = concurrency ?? 4;
      const tasks = files.map((file) => () => startUpload(file));
      const results = await executeWithConcurrency(tasks, limit);
      return results;
    },
    [startUpload, concurrency]
  );

  const isUploading = Array.from(uploads.values()).some((state) => state.status === 'uploading');

  const reset = useCallback(() => {
    setUploads(new Map());
  }, []);

  return {
    upload,
    uploadMultiple,
    uploads,
    isUploading,
    reset,
  };
}
