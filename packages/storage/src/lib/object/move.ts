import type { TigrisStorageResponse } from '../types';
import { type CopyOptions, type CopyResponse, copyOrMove } from './copy';

export type MoveOptions = CopyOptions;
export type MoveResponse = CopyResponse;

export async function move(
  src: string,
  dest: string,
  options?: MoveOptions
): Promise<TigrisStorageResponse<MoveResponse, Error>> {
  return copyOrMove(src, dest, true, options);
}
