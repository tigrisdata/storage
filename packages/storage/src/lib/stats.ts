import { createStorageClient } from './http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export type GetStatsOptions = {
  config?: TigrisStorageConfig;
};

type BucketType = 'Regular' | 'Snapshot';
type BucketVisibility = 'public' | 'private';

export type StatsResponse = {
  stats: {
    activeBuckets: number;
    totalObjects: number;
    totalStorageBytes: number;
    totalUniqueObjects: number;
  };
  buckets: Array<{
    name: string;
    creationDate: Date;
    forkInfo:
      | {
          hasChildren: boolean;
          parents: Array<{
            bucketName: string;
            forkCreatedAt: Date;
            snapshot: string;
            snapshotCreatedAt: Date;
          }>;
        }
      | undefined;
    type: BucketType;
    regions: Array<string>;
    visibility: BucketVisibility;
  }>;
};

type StatsApiResponse = {
  Stats: {
    ActiveBuckets: number;
    TotalObjects: number;
    TotalStorageBytes: number;
    TotalUniqueObjects: number;
  };
  Buckets: {
    Bucket: Array<{
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
      Type: 'Regular' | 'Snapshot';
      Visibility: {
        IsPublic: boolean;
      };
    }>;
  };
};

export async function getStats(
  options?: GetStatsOptions
): Promise<TigrisStorageResponse<StatsResponse, Error>> {
  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  try {
    const response = await storageHttpClient.request<unknown, StatsApiResponse>(
      {
        method: 'GET',
        path: `/?IncludeVisibility=true&IncludeOwnerInfo=true&IncludeRegionsInfo=true&IncludeTypeInfo=true&IncludeForkInfo=true&IncludeStats=true`,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (response.error) {
      return { error: response.error };
    }

    const data = {
      stats: {
        activeBuckets: response.data.Stats.ActiveBuckets,
        totalObjects: response.data.Stats.TotalObjects,
        totalStorageBytes: response.data.Stats.TotalStorageBytes,
        totalUniqueObjects: response.data.Stats.TotalUniqueObjects,
      },
      buckets: response.data.Buckets.Bucket.map((bucket) => ({
        name: bucket.Name,
        creationDate: new Date(bucket.CreationDate),
        regions: bucket.Regions ? bucket.Regions.split(',') : ['global'],
        type: bucket.Type as BucketType,
        visibility: (bucket.Visibility.IsPublic === true
          ? 'public'
          : 'private') as BucketVisibility,
        forkInfo: bucket.ForkInfo
          ? {
              hasChildren: bucket.ForkInfo.HasChildren,
              parents:
                bucket.ForkInfo.Parents?.map((parent) => ({
                  bucketName: parent.BucketName,
                  forkCreatedAt: new Date(parent.ForkCreatedAt),
                  snapshot: parent.Snapshot,
                  snapshotCreatedAt: new Date(parent.SnapshotCreatedAt),
                })) ?? [],
            }
          : undefined,
      })),
    };

    return { data };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
