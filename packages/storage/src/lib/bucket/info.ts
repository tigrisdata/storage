import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { StorageClass } from './create';
import { createStorageClient } from '../http-client';

export type GetBucketInfoOptions = {
  config?: TigrisStorageConfig;
};

export type BucketInfoResponse = {
  isSnapshotEnabled: boolean;
  /**
   * @deprecated
   * @see forkInfo.hasChildren
   * This property is deprecated and will be removed in the next major version
   */
  hasForks: boolean;
  /**
   * @deprecated
   * @see forkInfo.parents[0].bucketName
   * This property is deprecated and will be removed in the next major version
   */
  sourceBucketName?: string;
  /**
   * @deprecated
   * @see forkInfo.parents[0].snapshot
   * This property is deprecated and will be removed in the next major version
   */
  sourceBucketSnapshot?: string;

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
  settings: {
    allowObjectAcl: boolean;
    defaultTier: StorageClass;
  };
  sizeInfo: {
    numberOfObjects: number | undefined;
    size: number | undefined;
    numberOfObjectsAllVersions: number | undefined;
  };
};

type BucketInfoApiResponse = {
  ForkInfo?: {
    HasChildren: boolean;
    Parents: Array<{
      BucketName: string;
      ForkCreatedAt: string;
      Snapshot: string;
      SnapshotCreatedAt: string;
    }>;
  };
  name: string;
  storage_class: StorageClass;
  type?: 1;
  tier_sizes: Record<string, number>;
  acl_settings?: {
    allow_object_acl: boolean;
  };
  estimated_unique_rows?: number; // number of objects
  estimated_size?: number; // estimated size of the bucket in bytes
  estimated_rows?: number; // estimated number of objects in the bucket (all versions)
};

export async function getBucketInfo(
  bucketName: string,
  options?: GetBucketInfoOptions
): Promise<TigrisStorageResponse<BucketInfoResponse, Error>> {
  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  try {
    const response = await storageHttpClient.request<
      unknown,
      BucketInfoApiResponse
    >({
      method: 'GET',
      path: `/${bucketName}?metadata&with-size=true`,
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.error) {
      return { error: response.error };
    }

    const data = {
      isSnapshotEnabled: response.data.type === 1,
      hasForks: response.data.ForkInfo?.HasChildren ?? false,
      sourceBucketName: response.data.ForkInfo?.Parents?.[0]?.BucketName,
      sourceBucketSnapshot: response.data.ForkInfo?.Parents?.[0]?.Snapshot,

      forkInfo: response.data.ForkInfo
        ? {
            hasChildren: response.data.ForkInfo.HasChildren,
            parents: response.data.ForkInfo.Parents?.map((parent) => ({
              bucketName: parent.BucketName,
              forkCreatedAt: new Date(parent.ForkCreatedAt),
              snapshot: parent.Snapshot,
              snapshotCreatedAt: new Date(parent.SnapshotCreatedAt),
            })) ?? [],
          }
        : undefined,
      settings: {
        allowObjectAcl: response.data.acl_settings?.allow_object_acl ?? false,
        defaultTier: response.data.storage_class as StorageClass,
      },
      sizeInfo: {
        numberOfObjects: response.data.estimated_unique_rows ?? undefined,
        size: response.data.estimated_size ?? undefined,
        numberOfObjectsAllVersions: response.data.estimated_rows ?? undefined,
      },
    };

    return { data };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
