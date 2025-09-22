# @tigrisdata/react

React components and hooks for Tigris object storage.

## Installation

```bash
npm install @tigrisdata/react @tigrisdata/storage
```

## Components

### FileUpload

A file upload component with drag-and-drop support.

```tsx
import { FileUpload } from '@tigrisdata/react';

function App() {
  return (
    <FileUpload
      accept="image/*"
      multiple
      onUpload={(file) => console.log('File selected:', file)}
      onSuccess={(url) => console.log('Upload successful:', url)}
      onError={(error) => console.error('Upload failed:', error)}
    />
  );
}
```

### ProgressBar

Display upload progress.

```tsx
import { ProgressBar } from '@tigrisdata/react';

function App() {
  return <ProgressBar progress={75} showPercentage />;
}
```

### FilePreview

Preview selected files before upload.

```tsx
import { FilePreview } from '@tigrisdata/react';

function App() {
  return (
    <FilePreview
      file={selectedFile}
      onRemove={() => console.log('File removed')}
    />
  );
}
```

## Hooks

### useUpload

Hook for handling file uploads with progress tracking.

```tsx
import { useUpload } from '@tigrisdata/react';

function App() {
  const { uploadFile, isUploading, progress, error, url } = useUpload();

  const handleUpload = (file: File) => {
    uploadFile(file, {
      onProgress: (progress) => console.log('Progress:', progress),
      onSuccess: (url) => console.log('Success:', url),
      onError: (error) => console.error('Error:', error),
    });
  };

  return (
    <div>
      {isUploading && progress && (
        <div>Uploading: {progress.percentage}%</div>
      )}
      {url && <div>Uploaded: {url}</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

### useFileList

Hook for managing a list of selected files.

```tsx
import { useFileList } from '@tigrisdata/react';

function App() {
  const { files, addFiles, removeFile, clearFiles } = useFileList();

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />
      {files.map((file, index) => (
        <div key={index}>
          {file.name}
          <button onClick={() => removeFile(index)}>Remove</button>
        </div>
      ))}
      <button onClick={clearFiles}>Clear All</button>
    </div>
  );
}
```

## License

MIT