import { ListBucketsCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListForksOptions = {
  config?: TigrisStorageConfig;
  paginationToken?: string;
  limit?: number;
};

export type BucketFork = {
  name: string;
  creationDate: Date;
};

export type ListForksResponse = {
  forks: BucketFork[];
  paginationToken?: string;
};

export async function listForks(
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
export async function listForks(
  sourceBucketName?: string,
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
export async function listForks(
  sourceBucketName?: string | ListForksOptions,
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>> {
  if (typeof sourceBucketName === 'object') {
    options = sourceBucketName;
    sourceBucketName = undefined;
  }

  const sourceBucket = sourceBucketName ?? config.bucket;

  if (!sourceBucket) {
    return { error: new Error('Source bucket name is required') };
  }

  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  const command = new ListBucketsCommand({
    ContinuationToken: options?.paginationToken,
    MaxBuckets: options?.limit,
  });
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers[TigrisHeaders.FORK] = sourceBucket;
      return next(args);
    },
    { step: 'build' }
  );

  try {
    return tigrisClient
      .send(command)
      .then((res) => {
        return {
          data: {
            forks:
              res.Buckets?.map((bucket) => ({
                name: bucket.Name!,
                creationDate: new Date(bucket.CreationDate!),
              })) ?? [],
            paginationToken: res.ContinuationToken,
          },
        };
      })
      .catch((error) => {
        return {
          error: new Error(`Unable to list bucket forks: ${error.message}`),
        };
      });
  } catch {
    return { error: new Error('Unable to list bucket forks') };
  }
}
