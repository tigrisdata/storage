# @tigrisdata/react

React components for [Tigris Storage](https://www.tigrisdata.com/).

## Installation

```bash
npm install @tigrisdata/react
```

## Requirements

- React 18+
- A backend with upload endpoint using Tigris Storage SDK. [You can see example here](https://www.tigrisdata.com/docs/sdks/tigris/examples/#client-uploads)

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
| `concurrency`        | `number`                                         | `4`       | Max concurrent uploads (files or multipart parts)      |
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

Default styles use CSS `@layer tigris`, so your custom styles will always take precedence without needing `!important`.

### Custom Styles

The component uses `tigris-` prefixed class names with state modifiers:

```css
/* Override default styles easily */
.tigris-uploader {
  border-color: purple;
}
```

### CSS Classes

| Class                                | Description                                  |
| ------------------------------------ | -------------------------------------------- |
| `.tigris-uploader`                   | Container element                            |
| `.tigris-uploader.is-dragging`       | When files are dragged over                  |
| `.tigris-uploader.is-uploading`      | When upload is in progress                   |
| `.tigris-uploader.is-disabled`       | When disabled                                |
| `.tigris-uploader-input`             | Hidden file input                            |
| `.tigris-uploader-text`              | Default text content                         |
| `.tigris-uploader-link`              | "Browse" link text                           |
| `.tigris-uploader-filelist`          | File list container                          |
| `.tigris-uploader-file`              | Individual file item                         |
| `.tigris-uploader-file.is-pending`   | File waiting in queue                        |
| `.tigris-uploader-file.is-uploading` | File currently uploading                     |
| `.tigris-uploader-file.is-success`   | Upload succeeded                             |
| `.tigris-uploader-file.is-error`     | Upload failed                                |
| `.tigris-uploader-filename`          | File name text                               |
| `.tigris-uploader-progress`          | Progress bar container                       |
| `.tigris-uploader-progress-fill`     | Progress bar fill                            |
| `.tigris-uploader-status`            | Status text (Pending/0-100%/Uploaded/Failed) |

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
