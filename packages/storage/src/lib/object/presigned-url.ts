import { config, missingConfigError } from '../config';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type GetPresignedUrlOperation = 'get' | 'put';

type MethodOrOperation =
  | {
      method: GetPresignedUrlOperation;
      operation?: never;
    }
  | {
      operation: GetPresignedUrlOperation;
      method?: never;
    };

export type GetPresignedUrlOptions = {
  /**
   * The access key ID to use for the presigned URL.
   * If not provided, the access key ID from the config will be used.
   */
  accessKeyId?: string;
  /**
   * The expiration time of the presigned URL in seconds.
   * Default is 3600 seconds (1 hour).
   */
  expiresIn?: number;
  config?: TigrisStorageConfig;
} & MethodOrOperation;

export type GetPresignedUrlResponse = {
  url: string;
  expiresIn: number;
} & MethodOrOperation;

export async function getPresignedUrl(
  path: string,
  options: GetPresignedUrlOptions
): Promise<TigrisStorageResponse<GetPresignedUrlResponse, Error>> {
  const { data: client, error } = createStorageClient(options?.config);

  if (error) {
    return { error };
  }

  const bucket = options?.config?.bucket ?? config.bucket;
  const expiresIn = options.expiresIn ?? 3600; // 1 hour default
  const operation = options.operation ?? options.method;
  const accessKeyId =
    options.accessKeyId ?? options.config?.accessKeyId ?? config.accessKeyId;

  if (!accessKeyId) {
    return missingConfigError('accessKeyId');
  }

  if (!bucket) {
    return missingConfigError('bucket');
  }

  if (!operation) {
    return {
      error: new Error(
        'Operation is required, possible values are `get` and `put`'
      ),
    };
  }

  const body = {
    bucket,
    expires_in: expiresIn,
    key: path,
    key_id: accessKeyId,
    type: operation,
  };

  const response = await client.request<
    Record<string, unknown>,
    {
      bucket: string;
      custom_domain_url: string;
      key: string;
      key_id: string;
      key_secret: string;
      type: GetPresignedUrlOperation;
      url: string;
    }
  >({
    method: 'POST',
    path: `/?func=presign`,
    body,
  });

  if (response.error) {
    return {
      error: response.error.message
        ? new Error(response.error.message)
        : response.error,
    };
  }

  return {
    data: {
      url: response.data.url,
      expiresIn,
      operation,
    },
  };
}
