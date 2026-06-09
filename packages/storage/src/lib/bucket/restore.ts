import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type RestoreBucketOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type RestoreBucketResponse = {
  bucket: string;
  restored: boolean;
};

/**
 * Restore a soft-deleted bucket within its retention window.
 *
 * Soft delete is configured via `updateBucket(name, { softDelete })`; a
 * bucket removed while soft delete is enabled can be recovered with this
 * call until its retention period elapses. List recoverable buckets with
 * `listBuckets({ deleted: true })`.
 */
export async function restoreBucket(
  bucketName: string,
  options?: RestoreBucketOptions
): Promise<TigrisStorageResponse<RestoreBucketResponse, Error>> {
  if (!bucketName) {
    return { error: new Error('Bucket name is required') };
  }

  const { data: client, error } = createStorageClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const response = await client.request<
    undefined,
    { status?: 'success' | 'error'; message?: string }
  >({
    method: 'POST',
    path: `/${bucketName}?restore`,
  });

  if (response.error) {
    return { error: response.error };
  }

  if (response.data?.status === 'error') {
    return {
      error: new Error(response.data.message ?? 'Failed to restore bucket'),
    };
  }

  return {
    data: {
      bucket: bucketName,
      restored: true,
    },
  };
}
