import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config, missingConfigError } from './config';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

type ListOptions = {
  limit?: number;
  paginationMarker?: string;
  config?: TigrisStorageConfig;
};

type Item = {
  id: string;
  name: string;
  size: number;
  lastModified: Date;
};

type ListResponse = {
  items: Item[];
  paginationToken: string | undefined;
  hasMore: boolean;
};

export async function list(
  options?: ListOptions
): Promise<TigrisStorageResponse<ListResponse, Error>> {
  if (!options?.config?.bucket && !config.bucket) {
    return missingConfigError('bucket');
  }

  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const list = new ListObjectsV2Command({
    Bucket: options?.config?.bucket ?? config.bucket,
    MaxKeys: options?.limit,
    ContinuationToken: options?.paginationMarker,
  });

  return tigrisClient
    .send(list)
    .then((res) => {
      return {
        data: {
          items:
            res.Contents?.map((item) => ({
              id: item.ETag?.replace(/"/g, '') ?? '',
              name: item.Key ?? '',
              size: item.Size ?? 0,
              lastModified: item.LastModified ?? new Date(),
            })) ?? [],
          paginationToken: res.NextContinuationToken,
          hasMore: res.IsTruncated ?? false,
        },
      };
    })
    .catch((error) => {
      return {
        error,
      };
    });
}
