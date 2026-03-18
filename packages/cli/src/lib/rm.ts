import {
  isRemotePath,
  parseRemotePath,
  isPathFolder,
  listAllItems,
  globToRegex,
  wildcardPrefix,
} from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { remove, removeBucket, list } from '@tigrisdata/storage';
import { requireInteractive, confirm } from '../utils/interactive.js';
import { exitWithError } from '../utils/exit.js';

let _jsonMode = false;

export default async function rm(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);
  const force = getOption<boolean>(options, ['force', 'f', 'F', 'yes', 'y']);
  const recursive = !!getOption<boolean>(options, ['recursive', 'r']);
  const jsonFlag = getOption<boolean>(options, ['json']);
  const format = jsonFlag
    ? 'json'
    : getOption<string>(options, ['format'], 'table');
  _jsonMode = format === 'json';

  if (!pathString) {
    exitWithError('path argument is required');
  }

  if (!isRemotePath(pathString)) {
    exitWithError('Path must be a remote Tigris path (t3:// or tigris://)');
  }

  const { bucket, path } = parseRemotePath(pathString);

  if (!bucket) {
    exitWithError('Invalid path');
  }

  const config = await getStorageConfig();

  // If no path and no trailing slash, remove the bucket
  const rawEndsWithSlash = pathString.endsWith('/');
  if (!path && !rawEndsWithSlash) {
    if (!force) {
      requireInteractive('Use --yes to skip confirmation');
      const confirmed = await confirm(
        `Are you sure you want to delete bucket '${bucket}'?`
      );
      if (!confirmed) {
        if (!_jsonMode) console.log('Aborted');
        return;
      }
    }

    const { error } = await removeBucket(bucket, { config });

    if (error) {
      exitWithError(error);
    }

    if (_jsonMode) {
      console.log(JSON.stringify({ action: 'removed', bucket }));
    } else {
      console.log(`Removed bucket '${bucket}'`);
    }
    return;
  }

  // Check if it's a wildcard or folder
  const isWildcard = path.includes('*');
  let isFolder = path.endsWith('/') || (!path && rawEndsWithSlash);

  // If not explicitly a folder, check if it's a prefix with objects
  if (!isWildcard && !isFolder) {
    isFolder = await isPathFolder(bucket, path, config);
  }

  if (isFolder && !isWildcard && !recursive) {
    exitWithError(
      'Source is a remote folder (not removed). Use -r to remove recursively.'
    );
  }

  if (isWildcard || isFolder) {
    // List and remove multiple objects
    const prefix = isWildcard
      ? wildcardPrefix(path)
      : path
        ? path.endsWith('/')
          ? path
          : `${path}/`
        : '';

    const { items, error } = await listAllItems(
      bucket,
      prefix || undefined,
      config
    );

    if (error) {
      exitWithError(error);
    }

    let itemsToRemove = items;

    if (isWildcard) {
      const filePattern = path.split('/').pop()!;
      const regex = globToRegex(filePattern);
      itemsToRemove = itemsToRemove.filter((item) => {
        const rel = prefix ? item.name.slice(prefix.length) : item.name;
        if (!recursive && rel.includes('/')) return false;
        return regex.test(rel.split('/').pop()!);
      });
    }

    // Also check if the folder marker itself exists (e.g., "hello/")
    const folderMarker = prefix;
    const hasFolderMarkerInList = itemsToRemove.some(
      (item) => item.name === folderMarker
    );

    // If folder marker not in list, check if it exists separately
    let hasSeparateFolderMarker = false;
    if (!hasFolderMarkerInList && !isWildcard) {
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
      if (_jsonMode) {
        console.log(JSON.stringify({ action: 'removed', count: 0 }));
      } else {
        console.log('No objects to remove');
      }
      return;
    }

    if (!force) {
      requireInteractive('Use --yes to skip confirmation');
      const confirmed = await confirm(
        `Are you sure you want to delete ${totalItems} object(s)?`
      );
      if (!confirmed) {
        if (!_jsonMode) console.log('Aborted');
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
        if (!_jsonMode) console.log(`Removed t3://${bucket}/${item.name}`);
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
        if (!_jsonMode) console.log(`Removed t3://${bucket}/${folderMarker}`);
        removed++;
      }
    }

    if (_jsonMode) {
      console.log(JSON.stringify({ action: 'removed', count: removed }));
    } else {
      console.log(`Removed ${removed} object(s)`);
    }
  } else {
    // Remove single object
    if (!force) {
      requireInteractive('Use --yes to skip confirmation');
      const confirmed = await confirm(
        `Are you sure you want to delete 't3://${bucket}/${path}'?`
      );
      if (!confirmed) {
        if (!_jsonMode) console.log('Aborted');
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
      exitWithError(error);
    }

    if (_jsonMode) {
      console.log(
        JSON.stringify({
          action: 'removed',
          count: 1,
          path: `t3://${bucket}/${path}`,
        })
      );
    } else {
      console.log(`Removed t3://${bucket}/${path}`);
    }
  }
  process.exit(0);
}
