import { parseAnyPath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { createBucket, put, type StorageClass } from '@tigrisdata/storage';

export default async function mk(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    console.error('path argument is required');
    process.exit(1);
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    console.error('Invalid path');
    process.exit(1);
  }

  const config = await getStorageConfig();

  if (!path) {
    // Create a bucket
    const isPublic = getOption<boolean>(options, ['public']);
    const access = isPublic
      ? 'public'
      : getOption<string>(options, ['access', 'a', 'A']);
    const enableSnapshots = getOption<boolean>(options, [
      'enableSnapshots',
      'enable-snapshots',
      's',
      'S',
    ]);
    const defaultTier = getOption<string>(options, [
      'defaultTier',
      'default-tier',
      't',
      'T',
    ]);
    const consistency = getOption<string>(options, ['consistency', 'c', 'C']);
    const region = getOption<string>(options, ['region', 'r', 'R']);

    const { error } = await createBucket(bucket, {
      defaultTier: (defaultTier ?? 'STANDARD') as StorageClass,
      consistency: consistency === 'strict' ? 'strict' : 'default',
      enableSnapshot: enableSnapshots === true,
      access: (access ?? 'private') as 'public' | 'private',
      region:
        region !== 'global' && region !== undefined
          ? region.split(',')
          : undefined,
      config,
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.log(`Bucket '${bucket}' created`);
    process.exit(0);
  } else {
    // Create a "folder" (empty object with trailing slash)
    const folderPath = path.endsWith('/') ? path : `${path}/`;

    const { error } = await put(folderPath, '', {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.log(`Folder '${bucket}/${folderPath}' created`);
    process.exit(0);
  }
}
