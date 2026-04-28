import type { TigrisConfig, TigrisResponse } from '@shared/types';

export type TigrisStorageConfig = {
  bucket?: string;
  forcePathStyle?: boolean;
} & TigrisConfig;

export type TigrisStorageResponse<T, E = Error> = TigrisResponse<T, E>;
