import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { fetchBucketListing } from './listing';
import type { Bucket, BucketOwner } from './types';

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

export async function listBuckets(
  options?: ListBucketsOptions
): Promise<TigrisStorageResponse<ListBucketsResponse, Error>> {
  const { data, error } = await fetchBucketListing({
    flags: {
      includeOwnerInfo: true,
      includeRegionsInfo: true,
      includeTypeInfo: true,
      includeVisibility: true,
    },
    paginationToken: options?.paginationToken,
    limit: options?.limit,
    config: options?.config,
  });

  if (error) {
    return { error: new Error(`Unable to list buckets ${error.message}`) };
  }

  return {
    data: {
      buckets: data.buckets,
      owner: data.owner,
      paginationToken: data.paginationToken,
    },
  };
}
