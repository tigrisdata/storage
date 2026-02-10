import { list } from '@tigrisdata/storage';
import type { ParsedPath, ParsedPaths } from '../types.js';
import type { TigrisStorageConfig } from '../auth/s3-client.js';

const REMOTE_PREFIXES = ['t3://', 'tigris://'];

/**
 * Checks if a path is a remote Tigris path (starts with t3:// or tigris://)
 */
export function isRemotePath(path: string): boolean {
  return REMOTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Strips the t3:// or tigris:// prefix from a remote path and parses it into bucket/path.
 * Assumes the path has already been verified as remote via isRemotePath().
 */
export function parseRemotePath(path: string): ParsedPath {
  const prefix = REMOTE_PREFIXES.find((p) => path.startsWith(p));
  return parsePath(path.slice(prefix!.length));
}

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

/**
 * Converts a glob pattern to a RegExp.
 * `*` matches any characters except `/` (single-level wildcard).
 * All other regex metacharacters are escaped.
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*');
  return new RegExp('^' + escaped + '$');
}

/**
 * For a wildcard path, returns the directory prefix up to the `*`.
 * e.g. `folder/*.txt` → `folder/`, `*.txt` → ``, `a/b/*` → `a/b/`
 */
export function wildcardPrefix(wildcardPath: string): string {
  const starIndex = wildcardPath.indexOf('*');
  const slashBefore = wildcardPath.lastIndexOf('/', starIndex);
  return slashBefore >= 0 ? wildcardPath.slice(0, slashBefore + 1) : '';
}

export type ListItem = {
  id: string;
  name: string;
  size: number;
  lastModified: Date;
};

/**
 * Lists all objects with the given prefix, handling pagination automatically.
 * @param bucket - The bucket name
 * @param prefix - The prefix to filter by
 * @param config - Storage configuration
 * @returns Array of all items matching the prefix
 */
export async function listAllItems(
  bucket: string,
  prefix: string | undefined,
  config: TigrisStorageConfig
): Promise<{ items: ListItem[]; error?: Error }> {
  const allItems: ListItem[] = [];
  let paginationToken: string | undefined;

  do {
    const { data, error } = await list({
      prefix,
      paginationToken,
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      return { items: allItems, error };
    }

    if (data?.items) {
      allItems.push(...data.items);
    }

    paginationToken = data?.hasMore ? data.paginationToken : undefined;
  } while (paginationToken);

  return { items: allItems };
}
