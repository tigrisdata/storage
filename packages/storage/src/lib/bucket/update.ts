import { TigrisHeaders } from '@shared/headers';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type UpdateBucketOptions = {
  access?: 'public' | 'private';
  consistency?: 'strict' | 'default';
  region?: string | string[];
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type UpdateBucketResponse = {
  bucket: string;
  updated: boolean;
};

export async function updateBucket(
  bucketName: string,
  options?: UpdateBucketOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { data: client, error } = createStorageClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const body: Record<string, unknown> = {};
  const headers: Record<string, string> = {};

  if (options?.access !== undefined) {
    headers[TigrisHeaders.ACL] =
      options.access === 'public' ? 'public-read' : 'private';
  }

  if (options?.consistency !== undefined) {
    body.consistent = options.consistency === 'strict' ? true : false;
  }

  if (options?.region !== undefined) {
    body.object_regions = Array.isArray(options.region)
      ? options.region.join(',')
      : options.region;
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
    return { error: response.error };
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
