# @tigrisdata/react

React components for [Tigris Storage](https://www.tigrisdata.com/).

## Installation

```bash
npm install @tigrisdata/react
```

## Requirements

- React 18+
- A Tigris Storage backend with upload endpoint

## Usage

### Uploader Component

The `Uploader` component provides a drag-and-drop file upload interface:

```tsx
import { Uploader } from '@tigrisdata/react';
import '@tigrisdata/react/styles.css'; // Optional: import default styles

function App() {
  return (
    <Uploader
      url="/api/upload"
      multipartThreshold={10 * 1024 * 1024} // Use multipart for files > 10MB
      onUploadComplete={(file, response) => {
        console.log('Uploaded:', response.url);
      }}
      onUploadError={(file, error) => {
        console.error('Failed:', error.message);
      }}
    />
  );
}
```

#### Props

| Prop                 | Type                                             | Default   | Description                                            |
| -------------------- | ------------------------------------------------ | --------- | ------------------------------------------------------ |
| `url`                | `string`                                         | required  | Upload endpoint URL                                    |
| `multiple`           | `boolean`                                        | `false`   | Allow multiple files                                   |
| `accept`             | `string`                                         | -         | Accepted file types (e.g., `"image/*"`)                |
| `maxSize`            | `number`                                         | -         | Maximum file size in bytes                             |
| `disabled`           | `boolean`                                        | `false`   | Disable the uploader                                   |
| `multipart`          | `boolean`                                        | `false`   | Enable multipart upload for large files                |
| `partSize`           | `number`                                         | `5242880` | Part size in bytes for multipart uploads (default 5MB) |
| `multipartThreshold` | `number`                                         | -         | Auto-enable multipart for files larger than this size  |
| `uploadOptions`      | `UploadOptions`                                  | -         | Additional storage client options                      |
| `onUploadStart`      | `(file: File) => void`                           | -         | Called when upload starts                              |
| `onUploadProgress`   | `(file: File, progress: UploadProgress) => void` | -         | Called during upload                                   |
| `onUploadComplete`   | `(file: File, response: UploadResponse) => void` | -         | Called on success                                      |
| `onUploadError`      | `(file: File, error: Error) => void`             | -         | Called on failure                                      |
| `className`          | `string`                                         | -         | Custom CSS class                                       |
| `style`              | `CSSProperties`                                  | -         | Custom inline styles                                   |
| `children`           | `ReactNode`                                      | -         | Custom dropzone content                                |

### useUpload Hook

For custom upload UI, use the `useUpload` hook:

```tsx
import { useUpload } from '@tigrisdata/react';

function CustomUploader() {
  const { upload, uploads, isUploading, reset } = useUpload({
    url: '/api/upload',
    multipart: true, // Always use multipart
    partSize: 10 * 1024 * 1024, // 10MB parts
    onUploadComplete: (file, response) => {
      console.log('Done:', response.url);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      upload(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} disabled={isUploading} />
      {Array.from(uploads.values()).map((state) => (
        <div key={state.file.name}>
          {state.file.name}: {state.progress.percentage}%
        </div>
      ))}
    </div>
  );
}
```

#### Return Value

| Property         | Type                                                   | Description                       |
| ---------------- | ------------------------------------------------------ | --------------------------------- |
| `upload`         | `(file: File) => Promise<UploadResponse \| undefined>` | Upload a single file              |
| `uploadMultiple` | `(files: File[]) => Promise<...>`                      | Upload multiple files             |
| `uploads`        | `Map<string, FileUploadState>`                         | Current upload states             |
| `isUploading`    | `boolean`                                              | Whether any upload is in progress |
| `reset`          | `() => void`                                           | Reset all upload states           |

## Styling

### Default Styles

Import the default stylesheet for a ready-to-use look:

```tsx
import '@tigrisdata/react/styles.css';
```

### Custom Styles

The component uses class-based styling with state modifiers, giving you full control.

### CSS Classes

| Class                         | Description                   |
| ----------------------------- | ----------------------------- |
| `.uploader`                   | Container element             |
| `.uploader.is-dragging`       | When files are dragged over   |
| `.uploader.is-uploading`      | When upload is in progress    |
| `.uploader.is-disabled`       | When disabled                 |
| `.uploader-input`             | Hidden file input             |
| `.uploader-text`              | Default text content          |
| `.uploader-link`              | "Browse" link text            |
| `.uploader-filelist`          | File list container           |
| `.uploader-file`              | Individual file item          |
| `.uploader-file.is-uploading` | File currently uploading      |
| `.uploader-file.is-success`   | Upload succeeded              |
| `.uploader-file.is-error`     | Upload failed                 |
| `.uploader-filename`          | File name text                |
| `.uploader-progress`          | Progress bar container        |
| `.uploader-progress-fill`     | Progress bar fill             |
| `.uploader-status`            | Status text (Uploaded/Failed) |

### Example Styles

```css
.uploader {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.uploader.is-dragging {
  border-color: #2196f3;
  background-color: #e3f2fd;
}

.uploader.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.uploader-input {
  display: none;
}

.uploader-file {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.uploader-file.is-success {
  border-color: #4caf50;
}
.uploader-file.is-error {
  border-color: #f44336;
}

.uploader-progress {
  width: 100px;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.uploader-progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.2s;
}
```

## Server Setup

This package works with the `@tigrisdata/storage` server-side handler:

```ts
// app/api/upload/route.ts (Next.js App Router)
import { handleClientUpload } from '@tigrisdata/storage';

export async function POST(request: Request) {
  const body = await request.json();
  const result = await handleClientUpload(body);
  return Response.json(result);
}
```

## License

MIT
