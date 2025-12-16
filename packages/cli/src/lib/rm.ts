import * as readline from 'readline';
import { parsePath, isPathFolder } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { remove, removeBucket, list } from '@tigrisdata/storage';

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

export default async function rm(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);
  const force = getOption<boolean>(options, ['force', 'f', 'F']);

  if (!pathString) {
    console.error('path argument is required');
    process.exit(1);
  }

  const { bucket, path } = parsePath(pathString);

  if (!bucket) {
    console.error('Invalid path');
    process.exit(1);
  }

  const config = await getStorageConfig();

  // If no path, remove the bucket
  if (!path) {
    if (!force) {
      const confirmed = await confirm(
        `Are you sure you want to delete bucket '${bucket}'?`
      );
      if (!confirmed) {
        console.log('Aborted');
        return;
      }
    }

    const { error } = await removeBucket(bucket, { config });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.log(`Removed bucket '${bucket}'`);
    return;
  }

  // Check if it's a wildcard or folder
  const isWildcard = pathString.includes('*');
  let isFolder = path.endsWith('/');

  // If not explicitly a folder, check if it's a prefix with objects
  if (!isWildcard && !isFolder) {
    isFolder = await isPathFolder(bucket, path, config);
  }

  if (isWildcard || isFolder) {
    // List and remove multiple objects
    const prefix = isWildcard
      ? path.replace('*', '')
      : path.endsWith('/')
        ? path
        : `${path}/`;

    const { data, error } = await list({
      prefix: prefix || undefined,
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    const itemsToRemove = data.items || [];

    // Also check if the folder marker itself exists (e.g., "hello/")
    const folderMarker = prefix;
    const hasFolderMarkerInList = itemsToRemove.some(
      (item) => item.name === folderMarker
    );

    // If folder marker not in list, check if it exists separately
    let hasSeparateFolderMarker = false;
    if (!hasFolderMarkerInList) {
      const { data: markerData } = await list({
        prefix: folderMarker,
        limit: 1,
        config: {
          ...config,
          bucket,
        },
      });
      hasSeparateFolderMarker =
        markerData?.items?.some((item) => item.name === folderMarker) || false;
    }

    const totalItems = itemsToRemove.length + (hasSeparateFolderMarker ? 1 : 0);

    if (totalItems === 0) {
      console.log('No objects to remove');
      return;
    }

    if (!force) {
      const confirmed = await confirm(
        `Are you sure you want to delete ${totalItems} object(s)?`
      );
      if (!confirmed) {
        console.log('Aborted');
        return;
      }
    }

    let removed = 0;

    // Remove all items (including folder marker if in list)
    for (const item of itemsToRemove) {
      const { error: removeError } = await remove(item.name, {
        config: {
          ...config,
          bucket,
        },
      });

      if (removeError) {
        console.error(`Failed to remove ${item.name}: ${removeError.message}`);
      } else {
        console.log(`Removed ${bucket}/${item.name}`);
        removed++;
      }
    }

    // Remove folder marker if it exists separately
    if (hasSeparateFolderMarker) {
      const { error: removeError } = await remove(folderMarker, {
        config: {
          ...config,
          bucket,
        },
      });

      if (removeError) {
        console.error(
          `Failed to remove ${folderMarker}: ${removeError.message}`
        );
      } else {
        console.log(`Removed ${bucket}/${folderMarker}`);
        removed++;
      }
    }

    console.log(`Removed ${removed} object(s)`);
  } else {
    // Remove single object
    if (!force) {
      const confirmed = await confirm(
        `Are you sure you want to delete '${bucket}/${path}'?`
      );
      if (!confirmed) {
        console.log('Aborted');
        return;
      }
    }

    const { error } = await remove(path, {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.log(`Removed ${bucket}/${path}`);
  }
}
