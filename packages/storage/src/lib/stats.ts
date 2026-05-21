import { fetchBucketListing } from './bucket/listing';
import type { Bucket, BucketsStats } from './bucket/types';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export type GetStatsOptions = {
  paginationToken?: string;
  config?: TigrisStorageConfig;
};

export type StatsResponse = {
  paginationToken?: string;
  stats: BucketsStats;
  buckets: Bucket[];
};

export async function getStats(
  options?: GetStatsOptions
): Promise<TigrisStorageResponse<StatsResponse, Error>> {
  const { data, error } = await fetchBucketListing({
    flags: {
      includeVisibility: true,
      includeOwnerInfo: true,
      includeRegionsInfo: true,
      includeTypeInfo: true,
      includeForkInfo: true,
      includeStats: true,
    },
    paginationToken: options?.paginationToken,
    config: options?.config,
  });

  if (error) {
    return { error };
  }

  if (!data.stats) {
    return { error: new Error('Stats missing from listing response') };
  }

  return {
    data: {
      paginationToken: data.paginationToken,
      stats: data.stats,
      buckets: data.buckets,
    },
  };
}
