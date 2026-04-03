import { getStorageConfig } from '@auth/provider.js';
import { createBucket, put, type StorageClass } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { parseLocations } from '@utils/locations.js';
import { getFormat, getOption } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

export default async function mk(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    exitWithError('path argument is required');
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    exitWithError('Invalid path');
  }

  const config = await getStorageConfig();
  const format = getFormat(options);

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
    let locations = getOption<string>(options, ['locations', 'l', 'L']);
    const forkOf = getOption<string>(options, ['fork-of', 'forkOf', 'fork']);
    const sourceSnapshot = getOption<string>(options, [
      'source-snapshot',
      'sourceSnapshot',
      'source-snap',
    ]);

    // Handle deprecated --region and --consistency options
    const deprecatedRegion = getOption<string>(options, ['region', 'r', 'R']);
    const deprecatedConsistency = getOption<string>(options, [
      'consistency',
      'c',
      'C',
    ]);
    if (deprecatedRegion !== undefined) {
      console.warn(
        'Warning: --region is deprecated, use --locations instead. See https://www.tigrisdata.com/docs/buckets/locations/'
      );
      if (locations === undefined) {
        locations = deprecatedRegion;
      }
    }
    if (deprecatedConsistency !== undefined) {
      console.warn(
        'Warning: --consistency is deprecated, use --locations instead. See https://www.tigrisdata.com/docs/buckets/locations/'
      );
    }

    if (sourceSnapshot && !forkOf) {
      exitWithError('--source-snapshot requires --fork-of');
    }

    const { error } = await createBucket(bucket, {
      defaultTier: (defaultTier ?? 'STANDARD') as StorageClass,
      enableSnapshot: enableSnapshots === true,
      access: (access ?? 'private') as 'public' | 'private',
      locations: parseLocations(locations ?? 'global'),
      ...(forkOf ? { sourceBucketName: forkOf } : {}),
      ...(sourceSnapshot ? { sourceBucketSnapshot: sourceSnapshot } : {}),
      config,
    });

    if (error) {
      exitWithError(error);
    }

    if (format === 'json') {
      console.log(
        JSON.stringify({ action: 'created', type: 'bucket', name: bucket })
      );
    } else {
      console.log(`Bucket '${bucket}' created`);
    }
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
      exitWithError(error);
    }

    if (format === 'json') {
      console.log(
        JSON.stringify({
          action: 'created',
          type: 'folder',
          bucket,
          path: folderPath,
        })
      );
    } else {
      console.log(`Folder '${bucket}/${folderPath}' created`);
    }
    process.exit(0);
  }
}
