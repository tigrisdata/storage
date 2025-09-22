export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  error: Error | null;
  url: string | null;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (url: string) => void;
  onError?: (error: Error) => void;
  metadata?: Record<string, string>;
}

export interface FileUploadProps {
  onUpload?: (file: File) => void;
  onSuccess?: (url: string) => void;
  onError?: (error: Error) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  className?: string;
  children?: React.ReactNode;
}

export interface ProgressBarProps {
  progress: number;
  className?: string;
  showPercentage?: boolean;
}

export interface FilePreviewProps {
  file: File;
  onRemove?: () => void;
  className?: string;
}
