import { createStorageClient } from '../../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import type { UpdateBucketResponse } from '../types';
import type { UpdateBucketBody } from '../utils/api';

export type SetBucketSettingsOptions = {
  headers?: Record<string, string>;
  body?: UpdateBucketBody;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function setBucketSettings(
  bucketName: string,
  options?: SetBucketSettingsOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { data: client, error } = createStorageClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const { headers, body } = options ?? {};

  if (!headers && !body) {
    return {
      error: new Error('No settings provided'),
    };
  }

  const response = await client.request<
    Record<string, unknown>,
    { status: 'success' | 'error'; message?: string }
  >({
    method: 'PATCH',
    path: `/${bucketName}`,
    body,
    headers,
  });

  if (response.error) {
    return {
      error: response.error.message
        ? new Error(response.error.message)
        : response.error,
    };
  }

  if (response.data.status === 'error') {
    return {
      error: new Error(response.data.message ?? 'Failed to update bucket'),
    };
  }

  return {
    data: {
      bucket: bucketName,
      updated: true,
    },
  };
}
