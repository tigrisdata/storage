import type { TigrisResponse } from '@shared/types';

export type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  sessionToken?: string;
  organizationId?: string;
};

export type TigrisStorageResponse<T, E = Error> = TigrisResponse<T, E>;
