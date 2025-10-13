import type { ParsedPath, ParsedPaths } from '../types.js';

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
