import { getStorageConfig } from '@auth/provider.js';
import { list, listBuckets } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { formatOutput, formatSize } from '@utils/format.js';
import { getFormat, getOption } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

export default async function ls(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);
  const snapshotVersion = getOption<string>(options, [
    'snapshot-version',
    'snapshotVersion',
    'snapshot',
  ]);
  const format = getFormat(options);

  if (!pathString) {
    // No path provided, list all buckets
    const config = await getStorageConfig();
    const { data, error } = await listBuckets({ config });

    if (error) {
      exitWithError(error);
    }

    const buckets = (data.buckets || []).map((bucket) => ({
      name: bucket.name,
      created: bucket.creationDate,
    }));

    const output = formatOutput(buckets, format!, 'buckets', 'bucket', [
      { key: 'name', header: 'Name' },
      { key: 'created', header: 'Created' },
    ]);

    console.log(output);
    return;
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    exitWithError('Invalid path');
  }

  const config = await getStorageConfig();

  // Normalize prefix: ensure trailing slash for directory-like listing
  const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : undefined;

  const { data, error } = await list({
    prefix,
    ...(snapshotVersion ? { snapshotVersion } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    exitWithError(error);
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

  const output = formatOutput(objects, format!, 'objects', 'object', [
    { key: 'key', header: 'Key' },
    { key: 'size', header: 'Size' },
    { key: 'modified', header: 'Modified' },
  ]);

  console.log(output);
}
