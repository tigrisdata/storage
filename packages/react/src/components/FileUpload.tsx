import React, { useRef } from 'react';
import type { FileUploadProps } from '../types';

export function FileUpload({
  onUpload,
  onError,
  accept,
  multiple = false,
  maxSize,
  className = '',
  children,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);

    // Validate file sizes if maxSize is specified
    if (maxSize) {
      const oversizedFiles = fileArray.filter((file) => file.size > maxSize);
      if (oversizedFiles.length > 0) {
        const error = new Error(
          `Files exceed maximum size of ${maxSize} bytes`
        );
        onError?.(error);
        return;
      }
    }

    // Process each file
    fileArray.forEach((file) => {
      onUpload?.(file);
    });
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className={`tigris-file-upload ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <div onClick={handleClick} style={{ cursor: 'pointer' }}>
        {children || (
          <div className="tigris-upload-area">
            <p>Click to upload files</p>
            {accept && <p>Accepted types: {accept}</p>}
            {maxSize && <p>Max size: {Math.round(maxSize / 1024 / 1024)}MB</p>}
          </div>
        )}
      </div>
    </div>
  );
}
