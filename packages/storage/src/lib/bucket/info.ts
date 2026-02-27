import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import type {
  BucketCorsRule,
  BucketLifecycleRule,
  BucketMigration,
  BucketNotification,
  BucketTtl,
  StorageClass,
} from './types';
import type { GetBucketInfoApiResponseBody } from './utils/api';
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
    lifecycleRules?: BucketLifecycleRule[];
    dataMigration?: Omit<BucketMigration, 'enabled'>;
    ttlConfig?: BucketTtl;
    customDomain?: string;
    deleteProtection: boolean;
    corsRules: BucketCorsRule[];
    additionalHeaders?: Record<string, string>;
    notifications?: BucketNotification;
  };
  sizeInfo: {
    numberOfObjects: number | undefined;
    size: number | undefined;
    numberOfObjectsAllVersions: number | undefined;
  };
};


function mapNotification(
  n: NonNullable<GetBucketInfoApiResponseBody['object_notifications']>
): BucketNotification {
  const base = { enabled: n.enabled, url: n.web_hook, filter: n.filter };

  if ('auth' in n) {
    if ('token' in n.auth) {
      return { ...base, auth: { token: n.auth.token } };
    }
    return {
      ...base,
      auth: { username: n.auth.basic_user, password: n.auth.basic_pass },
    };
  }

  return base;
}

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
      GetBucketInfoApiResponseBody
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

    const ttlConfig = response.data.lifecycle_rules?.find(
      (rule) => rule.expiration !== undefined
    );

    const data: BucketInfoResponse = {
      isSnapshotEnabled: response.data.type === 1,
      hasForks: response.data.ForkInfo?.HasChildren ?? false,
      sourceBucketName: response.data.ForkInfo?.Parents?.[0]?.BucketName,
      sourceBucketSnapshot: response.data.ForkInfo?.Parents?.[0]?.Snapshot,

      forkInfo: response.data.ForkInfo
        ? {
            hasChildren: response.data.ForkInfo.HasChildren,
            parents:
              response.data.ForkInfo.Parents?.map((parent) => ({
                bucketName: parent.BucketName,
                forkCreatedAt: new Date(parent.ForkCreatedAt),
                snapshot: parent.Snapshot,
                snapshotCreatedAt: new Date(parent.SnapshotCreatedAt),
              })) ?? [],
          }
        : undefined,
      settings: {
        additionalHeaders: response.data.additional_http_headers,
        allowObjectAcl: response.data.acl_settings?.allow_object_acl ?? false,
        defaultTier: response.data.storage_class as StorageClass,
        customDomain: response.data.website?.domain_name,
        deleteProtection: response.data.protection?.protected ?? false,
        dataMigration: response.data.shadow_bucket
          ? {
              accessKey: response.data.shadow_bucket.access_key,
              secretKey: response.data.shadow_bucket.secret_key,
              region: response.data.shadow_bucket.region,
              name: response.data.shadow_bucket.name,
              endpoint: response.data.shadow_bucket.endpoint,
              writeThrough: response.data.shadow_bucket.write_through,
            }
          : undefined,
        ttlConfig: ttlConfig
          ? {
              enabled: ttlConfig.status === 1,
              days: ttlConfig.expiration?.days,
              date: ttlConfig.expiration?.date,
              id: ttlConfig.id,
            }
          : undefined,
        lifecycleRules:
          response.data.lifecycle_rules
            ?.filter((rule) => rule.expiration === undefined)
            .map((rule) => ({
              storageClass: rule.transitions?.[0]
                ?.storage_class as StorageClass,
              days: rule.transitions?.[0]?.days,
              date: rule.transitions?.[0]?.date,
              enabled: rule.status === 1,
              id: rule.id,
            })) ?? undefined,
        corsRules:
          response.data.cors?.rules.map((rule) => ({
            allowedOrigins: rule.allowedOrigin,
            allowedMethods: rule.allowedMethods,
            allowedHeaders: rule.allowedHeaders,
            exposeHeaders: rule.exposeHeaders,
            maxAge: rule.maxAge,
          })) ?? [],
        notifications: response.data.object_notifications
          ? mapNotification(response.data.object_notifications)
          : undefined,
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
