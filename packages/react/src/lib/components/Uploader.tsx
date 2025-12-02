import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { useUpload } from '../hooks/useUpload';
import type { UploaderProps, FileUploadState } from '../types';

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

function FileListItem({ state }: { state: FileUploadState }) {
  const { file, status, progress, error } = state;

  return (
    <div
      className={cn(
        'tigris-uploader-file',
        status === 'uploading' && 'is-uploading',
        status === 'success' && 'is-success',
        status === 'error' && 'is-error'
      )}
    >
      <span className="tigris-uploader-filename" title={file.name}>
        {file.name}
      </span>
      {status === 'uploading' && (
        <div className="tigris-uploader-progress">
          <div
            className="tigris-uploader-progress-fill"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      )}
      {status === 'success' && <span className="tigris-uploader-status">Uploaded</span>}
      {status === 'error' && (
        <span className="tigris-uploader-status" title={error?.message}>
          Failed
        </span>
      )}
    </div>
  );
}

export function Uploader({
  url,
  onUploadStart,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
  multiple = false,
  accept,
  maxSize,
  disabled = false,
  multipart = false,
  partSize,
  multipartThreshold,
  concurrency,
  uploadOptions,
  className,
  style,
  children,
}: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { upload, uploadMultiple, uploads, isUploading } = useUpload({
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
  });

  const validateFile = useCallback(
    (file: File): boolean => {
      // Validate accept pattern
      if (accept) {
        const acceptedTypes = accept.split(',').map((type) => type.trim());
        const fileType = file.type;
        const fileName = file.name;
        const fileExtension = fileName.includes('.') ? `.${fileName.split('.').pop()?.toLowerCase()}` : '';

        const isAccepted = acceptedTypes.some((acceptedType) => {
          // Handle MIME type wildcards (e.g., "image/*")
          if (acceptedType.endsWith('/*')) {
            const baseType = acceptedType.slice(0, -2);
            return fileType.startsWith(baseType + '/');
          }
          // Handle exact MIME types (e.g., "image/png")
          if (acceptedType.includes('/')) {
            return fileType === acceptedType;
          }
          // Handle file extensions (e.g., ".pdf")
          if (acceptedType.startsWith('.')) {
            return fileExtension === acceptedType.toLowerCase();
          }
          return false;
        });

        if (!isAccepted) {
          onUploadError?.(file, new Error(`File type not accepted. Allowed types: ${accept}`));
          return false;
        }
      }

      // Validate file size
      if (maxSize !== undefined && file.size > maxSize) {
        onUploadError?.(file, new Error(`File size exceeds maximum allowed size of ${maxSize} bytes`));
        return false;
      }
      return true;
    },
    [accept, maxSize, onUploadError]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles = fileArray.filter(validateFile);

      if (validFiles.length === 0) return;

      if (multiple) {
        uploadMultiple(validFiles);
      } else {
        upload(validFiles[0]);
      }
    },
    [multiple, upload, uploadMultiple, validateFile]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        handleFiles(files);
      }
      // Reset input so the same file can be selected again
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        handleFiles(files);
      }
    },
    [disabled, handleFiles]
  );

  const uploadList = Array.from(uploads.values());

  const containerClassName = cn(
    'tigris-uploader',
    isDragOver && 'is-dragging',
    isUploading && 'is-uploading',
    disabled && 'is-disabled',
    className
  );

  return (
    <div
      className={containerClassName}
      style={style}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        className="tigris-uploader-input"
        onChange={handleChange}
        multiple={multiple}
        accept={accept}
        disabled={disabled}
      />

      {children || (
        <p className="tigris-uploader-text">
          {isUploading ? (
            'Uploading...'
          ) : (
            <>
              Drag and drop {multiple ? 'files' : 'a file'} here, or{' '}
              <span className="tigris-uploader-link">browse</span>
            </>
          )}
        </p>
      )}

      {uploadList.length > 0 && (
        <div className="tigris-uploader-filelist" onClick={(e) => e.stopPropagation()}>
          {uploadList.map((state) => (
            <FileListItem key={`${state.file.name}-${state.file.size}-${state.file.lastModified}`} state={state} />
          ))}
        </div>
      )}
    </div>
  );
}
