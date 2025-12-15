import { parsePath } from '../utils/path.js';
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

  const config = await getStorageConfig();

  // Check if source is a single object or a prefix (folder/wildcard)
  const isWildcard = src.includes('*');
  const isFolder = src.endsWith('/');

  if (isWildcard || isFolder) {
    // List and copy multiple objects
    const prefix = isWildcard ? srcPath.path.replace('*', '') : srcPath.path;

    const { data, error } = await list({
      prefix: prefix || undefined,
      config: {
        ...config,
        bucket: srcPath.bucket,
      },
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    if (!data.items || data.items.length === 0) {
      console.log('No objects to copy');
      return;
    }

    let copied = 0;
    for (const item of data.items) {
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
