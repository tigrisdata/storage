import type { TigrisResponse } from '@shared/types';

export type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  sessionToken?: string;
  organizationId?: string;
  forcePathStyle?: boolean;
  credentialProvider?: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
  }>;
};

export type TigrisStorageResponse<T, E = Error> = TigrisResponse<T, E>;
