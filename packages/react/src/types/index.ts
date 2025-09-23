export type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

export interface UploaderProps {
  className?: string;
  mode?: 'server' | 'client';
  url: string;
  access?: 'public' | 'private';
  addRandomSuffix?: boolean;
  contentType?: string;
  allowedFileTypes?: string[];
  maxFileSize?: number;
  multiple?: boolean;
  multipart?: boolean;
  dragAndDrop?: boolean;
  onUploadProgress?: (progress: UploadProgress) => void;
}

export interface UploadMetadata {
  key: string;
  progress: UploadProgress;
  status:
    | 'queued'
    | 'pending'
    | 'uploading'
    | 'completed'
    | 'cancelled'
    | 'removed'
    | 'failed';
}

export interface UploadItem {
  metadata: UploadMetadata;
  object: File;
}
