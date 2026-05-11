import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { type CopyResponse, copyOrMove } from './copy';

export type MoveOptions = {
  config?: TigrisStorageConfig;
};

export type MoveResponse = CopyResponse;

/**
 * Move (rename) an object within a bucket. Cross-bucket moves are not
 * supported by the server; use `copy` followed by `remove` if you need
 * to move between buckets.
 */
export async function move(
  src: string,
  dest: string,
  options?: MoveOptions
): Promise<TigrisStorageResponse<MoveResponse, Error>> {
  return copyOrMove(src, dest, true, { config: options?.config });
}
