import { parsePath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { formatOutput, formatSize } from '../utils/format.js';
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

    const buckets = (data.buckets || []).map((bucket) => ({
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

  // Normalize prefix: ensure trailing slash for directory-like listing
  const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : undefined;

  const { data, error } = await list({
    prefix,
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const objects = (data.items || [])
    .map((item) => {
      // Strip the prefix from the name for cleaner display
      const name = prefix ? item.name.slice(prefix.length) : item.name;

      // For immediate children only: if name contains /, only show up to first /
      const firstSlash = name.indexOf('/');
      const displayName =
        firstSlash === -1 ? name : name.slice(0, firstSlash + 1);
      const isFolder = displayName.endsWith('/');

      return {
        key: displayName,
        size: isFolder ? '-' : formatSize(item.size),
        modified: item.lastModified,
      };
    })
    // Filter out empty keys and deduplicate folders
    .filter(
      (item, index, arr) =>
        item.key !== '' && arr.findIndex((i) => i.key === item.key) === index
    );

  const output = formatOutput(objects, 'table', 'objects', 'object', [
    { key: 'key', header: 'Key' },
    { key: 'size', header: 'Size' },
    { key: 'modified', header: 'Modified' },
  ]);

  console.log(output);
}
