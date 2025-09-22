import React from 'react';
import type { FilePreviewProps } from '../types';

export function FilePreview({
  file,
  onRemove,
  className = '',
}: FilePreviewProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isImage = file.type.startsWith('image/');

  return (
    <div className={`tigris-file-preview ${className}`}>
      <div className="tigris-file-info">
        {isImage && (
          <img
            src={URL.createObjectURL(file)}
            alt={file.name}
            className="tigris-file-thumbnail"
            style={{
              width: '50px',
              height: '50px',
              objectFit: 'cover',
              borderRadius: '4px',
            }}
            onLoad={(e) => {
              URL.revokeObjectURL((e.target as HTMLImageElement).src);
            }}
          />
        )}
        <div className="tigris-file-details">
          <div className="tigris-file-name">{file.name}</div>
          <div className="tigris-file-size">{formatFileSize(file.size)}</div>
          <div className="tigris-file-type">{file.type || 'Unknown type'}</div>
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="tigris-file-remove"
          aria-label="Remove file"
        >
          ×
        </button>
      )}
    </div>
  );
}
