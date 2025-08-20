export type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
};

export type TigrisStorageResponse<T, E = unknown> = {
  data?: T;
  error?: E;
};
