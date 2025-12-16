import * as readline from 'readline';
import { parsePath, isPathFolder } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { get, put, remove, list } from '@tigrisdata/storage';

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export default async function mv(options: Record<string, unknown>) {
  const src = getOption<string>(options, ['src']);
  const dest = getOption<string>(options, ['dest']);
  const force = getOption<boolean>(options, ['force', 'f', 'F']);

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

  // Cannot move a bucket itself
  if (!srcPath.path) {
    console.error('Cannot move a bucket. Provide a path within the bucket.');
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
    // List and move multiple objects
    const prefix = isWildcard
      ? srcPath.path.replace('*', '')
      : srcPath.path.endsWith('/')
        ? srcPath.path
        : `${srcPath.path}/`;

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
      console.log('No objects to move');
      return;
    }

    if (!force) {
      const confirmed = await confirm(
        `Are you sure you want to move ${data.items.length} object(s)?`
      );
      if (!confirmed) {
        console.log('Aborted');
        return;
      }
    }

    let moved = 0;
    for (const item of data.items) {
      const relativePath = prefix ? item.name.slice(prefix.length) : item.name;
      const destKey = destPath.path
        ? `${destPath.path.replace(/\/$/, '')}/${relativePath}`
        : relativePath;

      const moveResult = await moveObject(
        config,
        srcPath.bucket,
        item.name,
        destPath.bucket,
        destKey
      );

      if (moveResult.error) {
        console.error(`Failed to move ${item.name}: ${moveResult.error}`);
      } else {
        console.log(`Moved ${item.name} -> ${destPath.bucket}/${destKey}`);
        moved++;
      }
    }

    // Also move the folder marker if it exists
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
      const destFolderMarker = destPath.path
        ? `${destPath.path.replace(/\/$/, '')}/`
        : folderMarker;

      await moveObject(
        config,
        srcPath.bucket,
        folderMarker,
        destPath.bucket,
        destFolderMarker
      );
    }

    console.log(`Moved ${moved} object(s)`);
  } else {
    // Move single object
    if (!srcPath.path) {
      console.error('Source object key is required');
      process.exit(1);
    }

    const destKey = destPath.path || srcPath.path.split('/').pop()!;

    if (!force) {
      const confirmed = await confirm(
        `Are you sure you want to move '${srcPath.bucket}/${srcPath.path}'?`
      );
      if (!confirmed) {
        console.log('Aborted');
        return;
      }
    }

    const result = await moveObject(
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

    console.log(`Moved ${src} -> ${destPath.bucket}/${destKey}`);
  }
}

async function moveObject(
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

    // Delete source folder marker
    const { error: removeError } = await remove(srcKey, {
      config: {
        ...config,
        bucket: srcBucket,
      },
    });

    if (removeError) {
      return {
        error: `Copied but failed to delete source: ${removeError.message}`,
      };
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

  // Delete source
  const { error: removeError } = await remove(srcKey, {
    config: {
      ...config,
      bucket: srcBucket,
    },
  });

  if (removeError) {
    return {
      error: `Copied but failed to delete source: ${removeError.message}`,
    };
  }

  return {};
}
