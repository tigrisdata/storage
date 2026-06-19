import { TigrisHeaders } from '@shared/index';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import type { Bucket, BucketOwner, BucketsStats, BucketType } from './types';

type ListingFlags = {
  includeVisibility?: boolean;
  includeOwnerInfo?: boolean;
  includeRegionsInfo?: boolean;
  includeTypeInfo?: boolean;
  includeForkInfo?: boolean;
  includeStats?: boolean;
  onlyDeleted?: boolean;
  forksOf?: string;
};

type FetchBucketListingOptions = {
  flags?: ListingFlags;
  paginationToken?: string;
  limit?: number;
  config?: TigrisStorageConfig;
};

type FetchBucketListingResponse = {
  paginationToken?: string;
  owner?: BucketOwner;
  stats?: BucketsStats;
  buckets: Bucket[];
};

type ListingApiResponse = {
  ContinuationToken?: string;
  Owner?: {
    DisplayName?: string;
    ID?: string;
  };
  Stats?: {
    ActiveBuckets: number;
    TotalObjects: number;
    TotalStorageBytes: number;
    TotalUniqueObjects: number;
  };
  Buckets?: {
    Bucket?: Array<{
      SoftDeleteInfo?: {
        Enabled: boolean;
        RetentionDays: number;
      };
      CreationDate: string;
      ForkInfo?: {
        HasChildren: boolean;
        Parents?: Array<{
          BucketName: string;
          ForkCreatedAt: string;
          Snapshot: string;
          SnapshotCreatedAt: string;
        }>;
      };
      Name: string;
      Regions?: string;
      Type?: BucketType;
      Visibility?: {
        IsPublic: boolean;
      };
    }>;
  };
};

export async function fetchBucketListing(
  options?: FetchBucketListingOptions
): Promise<TigrisStorageResponse<FetchBucketListingResponse, Error>> {
  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  const flags = options?.flags ?? {};
  const query = new URLSearchParams();
  if (flags.includeVisibility) query.set('IncludeVisibility', 'true');
  if (flags.includeOwnerInfo) query.set('IncludeOwnerInfo', 'true');
  if (flags.includeRegionsInfo) query.set('IncludeRegionsInfo', 'true');
  if (flags.includeTypeInfo) query.set('IncludeTypeInfo', 'true');
  if (flags.includeForkInfo) query.set('IncludeForkInfo', 'true');
  if (flags.includeStats) query.set('IncludeStats', 'true');
  if (flags.onlyDeleted) query.set('OnlyDeleted', 'true');
  if (options?.paginationToken) {
    query.set('continuation-token', options.paginationToken);
  }
  if (options?.limit !== undefined) {
    query.set('max-buckets', String(options.limit));
  }

  try {
    const response = await storageHttpClient.request<
      unknown,
      ListingApiResponse
    >({
      method: 'GET',
      path: `/?${query.toString()}`,
      headers: {
        Accept: 'application/json',
        ...(flags.forksOf ? { [TigrisHeaders.FORK]: flags.forksOf } : {}),
      },
    });

    if (response.error) {
      return { error: response.error };
    }

    const buckets: Bucket[] =
      response.data.Buckets?.Bucket?.map((bucket) => {
        const mapped: Bucket = {
          name: bucket.Name,
          creationDate: new Date(bucket.CreationDate),
        };
        if (bucket.SoftDeleteInfo) {
          mapped.softDeleteInfo = {
            enabled: bucket.SoftDeleteInfo.Enabled,
            retentionDays: bucket.SoftDeleteInfo.RetentionDays,
          };
        }
        if (flags.includeRegionsInfo) {
          mapped.regions = bucket.Regions
            ? bucket.Regions.split(',')
            : ['global'];
        }
        if (flags.includeTypeInfo && bucket.Type) {
          mapped.type = bucket.Type;
        }
        if (flags.includeVisibility && bucket.Visibility) {
          mapped.visibility = bucket.Visibility.IsPublic ? 'public' : 'private';
        }
        if (flags.includeForkInfo || flags.forksOf !== undefined) {
          mapped.forkInfo = bucket.ForkInfo
            ? {
                hasChildren: bucket.ForkInfo.HasChildren,
                parents:
                  bucket.ForkInfo.Parents?.map((p) => ({
                    bucketName: p.BucketName,
                    forkCreatedAt: new Date(p.ForkCreatedAt),
                    snapshot: p.Snapshot,
                    snapshotCreatedAt: new Date(p.SnapshotCreatedAt),
                  })) ?? [],
              }
            : undefined;
        }
        return mapped;
      }) ?? [];

    const data: FetchBucketListingResponse = {
      paginationToken: response.data.ContinuationToken
        ? response.data.ContinuationToken
        : undefined,
      buckets,
    };

    if (flags.includeOwnerInfo && response.data.Owner) {
      data.owner = {
        name: response.data.Owner.DisplayName ?? '',
        id: response.data.Owner.ID ?? '',
      };
    }

    if (flags.includeStats && response.data.Stats) {
      data.stats = {
        activeBuckets: response.data.Stats.ActiveBuckets,
        totalObjects: response.data.Stats.TotalObjects,
        totalStorageBytes: response.data.Stats.TotalStorageBytes,
        totalUniqueObjects: response.data.Stats.TotalUniqueObjects,
      };
    }

    return { data };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
