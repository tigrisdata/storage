export type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
};

export type TigrisStorageResponse<T, E = Error> = {
  data?: T;
  error?: E;
};
