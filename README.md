# Tigris Monorepo

This monorepo contains multiple packages for Tigris object storage:

- [`@tigris/storage`](./packages/storage) - Core storage SDK
- [`@tigris/cli`](./packages/cli) - Command-line interface

Tigris is a globally distributed object storage service that provides low latency anywhere in the world, enabling developers to store and access any amount of data for a wide range of use cases.

## Getting started

## Development

### Setup

```bash
npm install
```

### Build all packages

```bash
npm run build
```

### Build individual packages

```bash
npm run build:storage
npm run build:cli
```

### Testing

```bash
npm test
```

## Installation

### Storage SDK

```bash
npm install @tigris/storage
```

### CLI

```bash
npm install -g @tigris/cli
```

### Create a Storage Bucket

1. Create an account at [storage.new](https://storage.new/). You'll be up and running in a minute.
2. Create a bucket with a unique name.
3. Create [Access Keys](https://console.tigris.dev/createaccesskey), make sure to save them somewhere as you will need them to configure in your project

### Configure your Project

In your project root, create a `.env` file if it doesn't exist already and put the following content in it. Replace the values with actual values your obtained from above steps

```
TIGRIS_STORAGE_ACCESS_KEY_ID=tid_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_yyyyyyyyyyyyyyyyyyyyyyy
TIGRIS_STORAGE_BUCKET=bucket_name
```

## API Reference

Tigris Storage API provides the following methods for managing objects in your storage bucket:

### Authentication & Configuration

All methods accept an optional `config` parameter that allows you to override the default environment configuration:

```typescript
import { list, get, put, head, remove } from '@tigris/storage';

// Use environment variables (default)
const result = await list();

// Override with custom config
const result = await list({
  config: {
    bucket: 'my-bucket-name',
    accessKeyId: 'tigris-access-key',
    secretAccessKey: 'tigris-secret-key',
    endpoint: 'https://t3.storage.dev',
  },
});

// Override only specific values
const result = await get('file.txt', 'string', {
  config: {
    bucket: 'different-bucket',
  },
});
```

The `config` parameter accepts:

- `bucket`: Storage bucket name
- `accessKeyId`: Your access key ID
- `secretAccessKey`: Your secret access key
- `endpoint`: Tigris Storage endpoint (defaults to `https://t3.storage.dev`)

### `list` - List Objects

Lists all objects in the bucket with pagination support.

```typescript
import { list } from '@tigris/storage';

// List first 100 objects
const result = await list({ limit: 100 });

if (result.error) {
  console.error('Error listing files:', result.error);
} else {
  console.log('Files:', result.data?.items);
  console.log('Has more:', result.data?.hasMore);
}

// Pagination example
let allFiles = [];
let currentPage = await list({ limit: 50 });

if (currentPage.data) {
  allFiles.push(...currentPage.data.items);

  while (currentPage.data.hasMore && currentPage.data.paginationToken) {
    currentPage = await list({
      limit: 50,
      paginationMarker: currentPage.data.paginationToken,
    });

    if (currentPage.data) {
      allFiles.push(...currentPage.data.items);
    } else if (currentPage.error) {
      console.error('Error during pagination:', currentPage.error);
      break;
    }
  }
}
```

The `list` function returns items with the following structure:

- `id`: Unique identifier for the object
- `name`: Object key/path
- `size`: Object size in bytes
- `lastModified`: Last modification date

### `head` - Get Object Metadata

Retrieves metadata for an object without downloading its content.

```typescript
import { head } from '@tigris/storage';

// Get metadata for a specific file
const result = await head('images/photo.jpg');

if (result?.error) {
  console.error('Error getting metadata:', result.error);
} else if (result?.data) {
  console.log('File size:', result.data.size);
  console.log('Content type:', result.data.contentType);
  console.log('Content disposition:', result.data.contentDisposition);
  console.log('Last modified:', result.data.modified);
  console.log('Download URL:', result.data.url);
} else {
  console.log('File not found');
}

// Check if file exists
const exists = await head('documents/report.pdf');
if (exists?.data) {
  console.log('File exists, size:', exists.data.size);
} else {
  console.log('File does not exist');
}
```

The `head` function returns metadata with the following structure:

- `size`: Object size in bytes
- `modified`: Last modification date
- `contentType`: MIME type of the object
- `contentDisposition`: Content disposition header value
- `url`: Download URL for the object
- `path`: Object key/path

### `get` - Download Object

Downloads an object from the bucket in various formats.

```typescript
import { get } from '@tigris/storage';

// Download as string
const result = await get('documents/readme.txt', 'string');
if (result.error) {
  console.error('Error downloading file:', result.error);
} else {
  console.log('Content:', result.data);
}

// Download as stream
const streamResult = await get('videos/large-video.mp4', 'stream');
if (streamResult.error) {
  console.error('Error downloading stream:', streamResult.error);
} else {
  const reader = streamResult.data.getReader();
  // Process stream...
}

// Download as File object
const fileResult = await get('images/photo.jpg', 'file');
if (fileResult.error) {
  console.error('Error downloading file:', result.error);
} else {
  console.log('File name:', fileResult.data.name);
  console.log('File size:', fileResult.data.size);
}

// Download with custom options
const downloadResult = await get('documents/report.pdf', 'string', {
  contentDisposition: 'attachment',
  contentType: 'application/pdf',
  encoding: 'utf-8',
});
```

The `get` function supports the following options:

- `contentDisposition`: Set to 'attachment' or 'inline' to control download behavior
- `contentType`: Override the content type for the response
- `encoding`: Specify encoding for string format (defaults to UTF-8)

### `put` - Upload Object

Uploads an object to the bucket with various options.

```typescript
import { put } from '@tigris/storage';

// Upload a text file
const result = await put('documents/hello.txt', 'Hello, World!');
if (result.error) {
  console.error('Error uploading file:', result.error);
} else {
  console.log('Uploaded to:', result.data.path);
  console.log('File size:', result.data.size);
  console.log('Download URL:', result.data.url);
}

// Upload with custom options
const imageResult = await put('images/photo.jpg', imageBlob, {
  contentType: 'image/jpeg',
  access: 'public',
  allowOverwrite: true,
});

// Upload with progress tracking
const uploadResult = await put('videos/large-video.mp4', videoStream, {
  multipart: true,
  onUploadProgress: ({ percentage }) => {
    console.log(`Upload progress: ${percentage}%`);
  },
});

// Upload with random suffix
const uniqueResult = await put('images/avatar.jpg', imageFile, {
  addRandomSuffix: true,
  contentType: 'image/jpeg',
});

// Upload with abort controller
const controller = new AbortController();
const uploadPromise = put('large-file.zip', fileData, {
  abortController: controller,
  multipart: true,
});

setTimeout(() => controller.abort(), 5000);
```

The `put` function returns a response object with the following structure:

- `path`: Object key/path
- `size`: Object size in bytes
- `modified`: Upload timestamp
- `contentType`: MIME type of the object
- `contentDisposition`: Content disposition header value
- `url`: Download URL for the object

### `remove` - Delete Object

Deletes an object from the bucket.

```typescript
import { remove } from '@tigris/storage';

// Delete a single file
const result = await remove('documents/old-file.txt');
if (result?.error) {
  console.error('Error deleting file:', result.error);
} else {
  console.log('File deleted successfully');
}

// Batch delete
const filesToDelete = ['temp/file1.txt', 'temp/file2.txt', 'temp/file3.txt'];

for (const file of filesToDelete) {
  const deleteResult = await remove(file);
  if (deleteResult?.error) {
    console.error(`Failed to delete ${file}:`, deleteResult.error);
  } else {
    console.log(`Deleted: ${file}`);
  }
}
```

**Note**: The `remove` function returns `undefined` on success and an error object on failure.

## Error Handling

All methods return a response object that may contain an error. Common scenarios include:

- **Configuration errors**: Missing bucket, access key, or secret key
- **Authentication errors**: Invalid credentials
- **Network errors**: Connection issues or timeouts
- **Permission errors**: Insufficient permissions for the operation

```typescript
import { get, put } from '@tigris/storage';

// Check for configuration errors
const result = await get('nonexistent.txt', 'string');
if (result.error) {
  if (result.error.message.includes('bucket is missing')) {
    console.log('Please configure your bucket in .env file');
  } else {
    console.error('Unexpected error:', result.error);
  }
}

// Handle upload conflicts
try {
  const uploadResult = await put('existing-file.txt', 'content', {
    allowOverwrite: false,
  });
  if (uploadResult.error) {
    console.error('Upload error:', uploadResult.error);
  }
} catch (error) {
  if (error.message.includes('File already exists')) {
    console.log('File already exists, use allowOverwrite: true to overwrite');
  }
}
```

## Best Practices

1. **Always check for errors** in the response object before accessing data
2. **Use pagination** for listing large numbers of objects
3. **Handle configuration errors** gracefully with proper error messages
4. **Use appropriate content types** when uploading files
5. **Consider multipart uploads** for large files
6. **Use progress callbacks** for better user experience
7. **Use random suffixes** to prevent accidental overwrites
8. **Leverage content disposition** options for better download behavior
9. **Use the returned metadata** for file information instead of making additional API calls
