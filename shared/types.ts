export type TigrisStorageCoreConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
};

export type TigrisStorageConfig = {
  sessionToken?: string;
  organizationId?: string;
  iamEndpoint?: string;
  authDomain?: string;
} & TigrisStorageCoreConfig;

export type TigrisStorageResponse<T, E = Error> =
  | {
      data: T;
      error?: never;
    }
  | {
      error: E;
      data?: never;
    };
