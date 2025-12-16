import { list } from '@tigrisdata/storage';
import type { ParsedPath, ParsedPaths } from '../types.js';
import type { TigrisStorageConfig } from '../auth/s3-client.js';

/**
 * Parses a path string into bucket and path components
 * @param pathString - The path string in format "bucket/path/to/object"
 * @returns Object with bucket and path properties
 */
export function parsePath(pathString: string): ParsedPath {
  const parts = pathString.split('/');
  return {
    bucket: parts[0],
    path: parts.slice(1).join('/'),
  };
}

/**
 * Checks if a path is a folder by looking for objects with that prefix.
 * This handles cases where a folder path is provided without a trailing slash.
 * @param bucket - The bucket name
 * @param path - The path to check
 * @param config - Storage configuration
 * @returns true if the path has objects underneath it (is a folder)
 */
export async function isPathFolder(
  bucket: string,
  path: string,
  config: TigrisStorageConfig
): Promise<boolean> {
  const { data } = await list({
    prefix: `${path}/`,
    limit: 1,
    config: {
      ...config,
      bucket,
    },
  });

  return !!(data?.items && data.items.length > 0);
}

/**
 * Parses source and destination paths
 * @param src - Source path string
 * @param dest - Destination path string
 * @returns Object with parsed source and destination
 */
export function parsePaths(src: string, dest: string): ParsedPaths {
  return {
    source: parsePath(src),
    destination: parsePath(dest),
  };
}
