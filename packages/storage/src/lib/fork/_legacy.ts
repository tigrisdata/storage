/**
 * @deprecated
 * This is a temporary solution to list forks. Should be removed when 1.320.0 makes it to production gateway.
 */

import { fetchBucketListing } from '../bucket/listing';
import { config } from '../config';
import type { TigrisStorageResponse } from '../types';
import type { BucketFork, ListForksOptions, ListForksResponse } from './list';

export async function listForksLegacy(
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
export async function listForksLegacy(
  sourceBucketName?: string,
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
export async function listForksLegacy(
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

  const forks: BucketFork[] = [];
  let paginationToken: string | undefined;

  do {
    const { data, error } = await fetchBucketListing({
      flags: { includeForkInfo: true },
      paginationToken,
      config: options?.config,
    });

    if (error) {
      return { error };
    }

    for (const bucket of data.buckets) {
      const parent = bucket.forkInfo?.parents.find(
        (p) => p.bucketName === sourceBucket
      );
      if (parent) {
        forks.push({
          name: bucket.name,
          creationDate: bucket.creationDate,
          forkCreatedAt: parent.forkCreatedAt,
          snapshot: parent.snapshot,
          snapshotCreatedAt: parent.snapshotCreatedAt,
        });
      }
    }

    paginationToken = data.paginationToken;
  } while (paginationToken);

  return {
    data: {
      forks,
    },
  };
}
