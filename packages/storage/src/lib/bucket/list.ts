import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListBucketsOptions = {
  config?: TigrisStorageConfig;
  paginationToken?: string;
  limit?: number;
};

export type ListBucketsResponse = {
  buckets: Bucket[];
  owner?: BucketOwner;
  paginationToken?: string;
};

export type Bucket = {
  name: string;
  creationDate: Date;
};

export type BucketOwner = {
  name: string;
  id: string;
};

export async function listBuckets(
  options?: ListBucketsOptions
): Promise<TigrisStorageResponse<ListBucketsResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error || !tigrisClient) {
    return { error };
  }

  const command = new ListBucketsCommand({
    ContinuationToken: options?.paginationToken,
    MaxBuckets: options?.limit,
  });

  return await tigrisClient
    .send(command)
    .then((res) => {
      if (!res.Buckets) {
        return { data: { buckets: [] } };
      }

      return {
        data: {
          buckets: res.Buckets.map((bucket) => ({
            name: bucket.Name!,
            creationDate: bucket.CreationDate!,
          })),
          owner: {
            name: res.Owner?.DisplayName ?? '',
            id: res.Owner?.ID ?? '',
          },
        },
      };
    })
    .catch((error) => {
      return { error: new Error(`Unable to list buckets ${error.message}`) };
    });
}
