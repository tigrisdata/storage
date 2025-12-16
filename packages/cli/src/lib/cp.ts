import { parsePath, isPathFolder, listAllItems } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { get, put, list } from '@tigrisdata/storage';

export default async function cp(options: Record<string, unknown>) {
  const src = getOption<string>(options, ['src']);
  const dest = getOption<string>(options, ['dest']);

  if (!src || !dest) {
    console.error('both src and dest arguments are required');
    process.exit(1);
  }

  const srcPath = parsePath(src);
  const destPath = parsePath(dest);

  if (!srcPath.bucket) {
    console.error('Invalid source path');
    process.exit(1);
  }

  if (!destPath.bucket) {
    console.error('Invalid destination path');
    process.exit(1);
  }

  // Cannot copy a bucket itself
  if (!srcPath.path) {
    console.error('Cannot copy a bucket. Provide a path within the bucket.');
    process.exit(1);
  }

  const config = await getStorageConfig();

  // Check if source is a single object or a prefix (folder/wildcard)
  const isWildcard = src.includes('*');
  let isFolder = src.endsWith('/');

  // If not explicitly a folder, check if it's a prefix with objects
  if (!isWildcard && !isFolder && srcPath.path) {
    isFolder = await isPathFolder(srcPath.bucket, srcPath.path, config);
  }

  if (isWildcard || isFolder) {
    // List and copy multiple objects
    const prefix = isWildcard
      ? srcPath.path.replace('*', '')
      : srcPath.path.endsWith('/')
        ? srcPath.path
        : `${srcPath.path}/`;

    const { items, error } = await listAllItems(
      srcPath.bucket,
      prefix || undefined,
      config
    );

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    // Filter out folder markers - they would result in empty destKey when copying to root
    const itemsToCopy = items.filter((item) => item.name !== prefix);

    if (itemsToCopy.length === 0) {
      console.log('No objects to copy');
      return;
    }

    let copied = 0;
    for (const item of itemsToCopy) {
      const relativePath = prefix ? item.name.slice(prefix.length) : item.name;
      const destKey = destPath.path
        ? `${destPath.path.replace(/\/$/, '')}/${relativePath}`
        : relativePath;

      const copyResult = await copyObject(
        config,
        srcPath.bucket,
        item.name,
        destPath.bucket,
        destKey
      );

      if (copyResult.error) {
        console.error(`Failed to copy ${item.name}: ${copyResult.error}`);
      } else {
        console.log(`Copied ${item.name} -> ${destPath.bucket}/${destKey}`);
        copied++;
      }
    }

    // Also copy the folder marker if it exists and we have a destination path
    if (destPath.path) {
      const folderMarker = srcPath.path.endsWith('/')
        ? srcPath.path
        : `${srcPath.path}/`;
      const { data: markerData } = await list({
        prefix: folderMarker,
        limit: 1,
        config: {
          ...config,
          bucket: srcPath.bucket,
        },
      });

      if (markerData?.items?.some((item) => item.name === folderMarker)) {
        const destFolderMarker = `${destPath.path.replace(/\/$/, '')}/`;
        const markerResult = await copyObject(
          config,
          srcPath.bucket,
          folderMarker,
          destPath.bucket,
          destFolderMarker
        );
        if (markerResult.error) {
          console.error(`Failed to copy folder marker: ${markerResult.error}`);
        }
      }
    }

    console.log(`Copied ${copied} object(s)`);
  } else {
    // Copy single object
    if (!srcPath.path) {
      console.error('Source object key is required');
      process.exit(1);
    }

    const destKey = destPath.path || srcPath.path.split('/').pop()!;

    const result = await copyObject(
      config,
      srcPath.bucket,
      srcPath.path,
      destPath.bucket,
      destKey
    );

    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }

    console.log(`Copied ${src} -> ${destPath.bucket}/${destKey}`);
  }
}

async function copyObject(
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  srcBucket: string,
  srcKey: string,
  destBucket: string,
  destKey: string
): Promise<{ error?: string }> {
  // Handle folder markers specially (empty objects ending with /)
  if (srcKey.endsWith('/')) {
    // Put empty string to destination (creates folder marker)
    const { error: putError } = await put(destKey, '', {
      config: {
        ...config,
        bucket: destBucket,
      },
    });

    if (putError) {
      return { error: putError.message };
    }

    return {};
  }

  // Get source object
  const { data, error: getError } = await get(srcKey, 'stream', {
    config: {
      ...config,
      bucket: srcBucket,
    },
  });

  if (getError) {
    return { error: getError.message };
  }

  // Put to destination
  const { error: putError } = await put(destKey, data, {
    config: {
      ...config,
      bucket: destBucket,
    },
  });

  if (putError) {
    return { error: putError.message };
  }

  return {};
}
