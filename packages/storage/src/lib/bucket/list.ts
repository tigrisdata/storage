import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { fetchBucketListing } from './listing';
import type { Bucket, BucketOwner } from './types';

export type ListBucketsOptions = {
  config?: TigrisStorageConfig;
  paginationToken?: string;
  limit?: number;
  /** Only soft-deleted buckets. */
  deleted?: boolean;
  /** Only buckets that are forks of another bucket. */
  forksOnly?: boolean;
  /** Only buckets owned by this user, by username (an email address). */
  owner?: string;
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
      onlyDeleted: options?.deleted,
      forksOnly: options?.forksOnly,
      owner: options?.owner,
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
