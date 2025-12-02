import type { UploadOptions, UploadProgress, UploadResponse } from '@tigrisdata/storage/client';

export type { UploadOptions, UploadProgress, UploadResponse };

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export interface FileUploadState {
  file: File;
  status: UploadStatus;
  progress: UploadProgress;
  response?: UploadResponse;
  error?: Error;
}

export interface UploaderProps {
  /**
   * The URL of the upload endpoint that handles client uploads
   */
  url: string;

  /**
   * Callback fired when upload starts
   */
  onUploadStart?: (file: File) => void;

  /**
   * Callback fired during upload progress
   */
  onUploadProgress?: (file: File, progress: UploadProgress) => void;

  /**
   * Callback fired when upload completes successfully
   */
  onUploadComplete?: (file: File, response: UploadResponse) => void;

  /**
   * Callback fired when upload fails
   */
  onUploadError?: (file: File, error: Error) => void;

  /**
   * Whether to allow multiple file uploads
   * @default false
   */
  multiple?: boolean;

  /**
   * Accepted file types (e.g., "image/*", ".pdf,.doc")
   */
  accept?: string;

  /**
   * Maximum file size in bytes
   */
  maxSize?: number;

  /**
   * Whether the uploader is disabled
   * @default false
   */
  disabled?: boolean;

  /**
   * Enable multipart upload for large files
   * @default false
   */
  multipart?: boolean;

  /**
   * Part size in bytes for multipart uploads
   * @default 5242880 (5MB)
   */
  partSize?: number;

  /**
   * Automatically use multipart upload for files larger than this size (in bytes)
   * When set, files larger than this threshold will use multipart upload automatically
   */
  multipartThreshold?: number;

  /**
   * Additional upload options passed to the storage client
   */
  uploadOptions?: Omit<UploadOptions, 'url' | 'onUploadProgress' | 'multipart' | 'partSize'>;

  /**
   * Custom class name for the container
   */
  className?: string;

  /**
   * Custom styles for the container
   */
  style?: React.CSSProperties;

  /**
   * Custom render function for the dropzone content
   */
  children?: React.ReactNode;
}

export interface UseUploadOptions {
  /**
   * The URL of the upload endpoint
   */
  url: string;

  /**
   * Enable multipart upload for large files
   * @default false
   */
  multipart?: boolean;

  /**
   * Part size in bytes for multipart uploads
   * @default 5242880 (5MB)
   */
  partSize?: number;

  /**
   * Automatically use multipart upload for files larger than this size (in bytes)
   * When set, files larger than this threshold will use multipart upload automatically
   */
  multipartThreshold?: number;

  /**
   * Additional upload options
   */
  uploadOptions?: Omit<UploadOptions, 'url' | 'onUploadProgress' | 'multipart' | 'partSize'>;

  /**
   * Callback fired when upload starts
   */
  onUploadStart?: (file: File) => void;

  /**
   * Callback fired during upload progress
   */
  onUploadProgress?: (file: File, progress: UploadProgress) => void;

  /**
   * Callback fired when upload completes successfully
   */
  onUploadComplete?: (file: File, response: UploadResponse) => void;

  /**
   * Callback fired when upload fails
   */
  onUploadError?: (file: File, error: Error) => void;
}

export interface UseUploadReturn {
  /**
   * Upload a single file
   */
  upload: (file: File) => Promise<UploadResponse | undefined>;

  /**
   * Upload multiple files
   */
  uploadMultiple: (files: File[]) => Promise<(UploadResponse | undefined)[]>;

  /**
   * Current upload states for all files
   */
  uploads: Map<string, FileUploadState>;

  /**
   * Whether any upload is in progress
   */
  isUploading: boolean;

  /**
   * Reset all upload states
   */
  reset: () => void;
}
