import { ListBucketsCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/headers';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListBucketsOptions = {
  config?: TigrisStorageConfig;
  paginationToken?: string;
  limit?: number;
  sourceBucketName?: string;
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

  if (error) {
    return { error };
  }

  const command = new ListBucketsCommand({
    ContinuationToken: options?.paginationToken,
    MaxBuckets: options?.limit,
  });

  const sourceBucket = options?.sourceBucketName;

  if (sourceBucket) {
    command.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers[TigrisHeaders.FORK] = sourceBucket;
        return next(args);
      },
      { step: 'build' }
    );
  }

  try {
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
            paginationToken: res.ContinuationToken,
          },
        };
      })
      .catch((error) => {
        return { error: new Error(`Unable to list buckets ${error.message}`) };
      });
  } catch {
    return { error: new Error('Unable to list buckets') };
  }
}
