import { config } from '../config';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { listForksLegacy } from './_fork';
import { fetchBucketListing } from './listing';
import type { Bucket } from './types';

export type ListForksOptions = {
  config?: TigrisStorageConfig;
  paginationToken?: string;
  limit?: number;
};

export type BucketFork = Bucket & {
  /**
   * @deprecated Use `@forkInfo.parents[0].forkCreatedAt` instead
   */
  forkCreatedAt: Date;
  /**
   * @deprecated Use `@forkInfo.parents[0].snapshot` instead
   */
  snapshot: string;
  /**
   * @deprecated Use `@forkInfo.parents[0].snapshotCreatedAt` instead
   */
  snapshotCreatedAt: Date;
};

/**
 * @deprecated Use `BucketFork` instead
 */
export type ForkedBucket = BucketFork;

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

  const { data, error } = await fetchBucketListing({
    flags: {
      forksOf: sourceBucket,
    },
    paginationToken: options?.paginationToken,
    limit: options?.limit,
    config: options?.config,
  });

  if (error) {
    return { error: new Error(`Unable to list buckets ${error.message}`) };
  }

  if (data.buckets.every((bucket) => bucket.forkInfo === undefined)) {
    return listForksLegacy(sourceBucket, options);
  }

  return {
    data: {
      forks: data.buckets.map((bucket) => ({
        ...bucket,
        forkCreatedAt: bucket.forkInfo?.parents[0]?.forkCreatedAt ?? new Date(),
        snapshot: bucket.forkInfo?.parents[0]?.snapshot ?? '',
        snapshotCreatedAt:
          bucket.forkInfo?.parents[0]?.snapshotCreatedAt ?? new Date(),
      })),
      paginationToken: data.paginationToken,
    },
  };
}
