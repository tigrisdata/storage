import { getStorageConfig } from '@auth/provider.js';
import { list, remove, removeBucket } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { getFormat, getOption } from '@utils/options.js';
import {
  countObjects,
  globToRegex,
  isFolderMarker,
  isPathFolder,
  isRemotePath,
  listAllItems,
  parseRemotePath,
  wildcardPrefix,
} from '@utils/path.js';

let _jsonMode = false;

export default async function rm(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force', 'f']);
  const recursive = !!getOption<boolean>(options, ['recursive', 'r']);
  const format = getFormat(options);
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

    const { error } = await removeBucket(bucket, { config, force });

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
        // The folder's own marker is not a file inside the folder, so a
        // wildcard never matches it - `rm folder/*` leaves `folder/` behind.
        if (item.name === prefix) return false;
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

    const keysToRemove = [
      ...itemsToRemove.map((item) => item.name),
      ...(hasSeparateFolderMarker ? [folderMarker] : []),
    ];

    if (keysToRemove.length === 0) {
      if (_jsonMode) {
        console.log(JSON.stringify({ action: 'removed', count: 0 }));
      } else {
        console.log('No objects to remove');
      }
      return;
    }

    const totalItems = countObjects(keysToRemove);

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

    const removedKeys: string[] = [];

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
        // Folder markers go away with the folder but aren't listed.
        if (!_jsonMode && !isFolderMarker(item.name))
          console.log(`Removed t3://${bucket}/${item.name}`);
        removedKeys.push(item.name);
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
        removedKeys.push(folderMarker);
      }
    }

    const removed = countObjects(keysToRemove, removedKeys);

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
