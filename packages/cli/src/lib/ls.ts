import { parsePath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { formatOutput } from '../utils/format.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { list, listBuckets } from '@tigrisdata/storage';

export default async function ls(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    // No path provided, list all buckets
    const config = await getStorageConfig();
    const { data, error } = await listBuckets({ config });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    if (!data.buckets || data.buckets.length === 0) {
      return;
    }

    const buckets = data.buckets.map((bucket) => ({
      name: bucket.name,
      created: bucket.creationDate,
    }));

    const output = formatOutput(buckets, 'table', 'buckets', 'bucket', [
      { key: 'name', header: 'Name' },
      { key: 'created', header: 'Created' },
    ]);

    console.log(output);
    return;
  }

  const { bucket, path } = parsePath(pathString);

  if (!bucket) {
    console.error('Invalid path');
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { data, error } = await list({
    prefix: path || undefined,
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (!data.items || data.items.length === 0) {
    return;
  }

  const objects = data.items.map((item) => ({
    key: item.name,
    size: formatSize(item.size),
    modified: item.lastModified,
  }));

  const output = formatOutput(objects, 'table', 'objects', 'object', [
    { key: 'key', header: 'Key' },
    { key: 'size', header: 'Size' },
    { key: 'modified', header: 'Modified' },
  ]);

  console.log(output);
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
