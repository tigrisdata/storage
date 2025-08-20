# @tigrisdata/storage

Tigris is a high-performance object storage system designed for multi-cloud environments.

## Installation

```bash
npm install @tigrisdata/storage
```

## Usage

```typescript
import { get, put, list, remove } from '@tigrisdata/storage';

// Upload a file
await put('my-file.txt', './local-file.txt');

// Download a file
const data = await get('my-file.txt');

// List files
const files = await list();

// Remove a file
await remove('my-file.txt');
```

## Configuration

Configure your Tigris credentials via environment variables:

```bash
TIGRIS_STORAGE_BUCKET=your-bucket
TIGRIS_STORAGE_ACCESS_KEY_ID=your-access-key
TIGRIS_STORAGE_SECRET_ACCESS_KEY=your-secret-key
TIGRIS_STORAGE_ENDPOINT=your-endpoint
```

## License

MIT