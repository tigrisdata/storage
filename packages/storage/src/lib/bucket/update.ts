import { TigrisHeaders } from '@shared/headers';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import type {
  BucketLocations,
  StorageClass,
  UpdateBucketResponse,
} from './types';
import type { UpdateBucketBody } from './utils/api';
import { validateLocationValues } from './utils/regions';

type UpdateBucketRequestBody = Pick<
  UpdateBucketBody,
  | 'acl_settings'
  | 'object_regions'
  | 'cache_control'
  | 'website'
  | 'protection'
  | 'additional_http_headers'
  | 'soft_delete'
  | 'storage_class'
>;

export type UpdateBucketOptions = {
  // access and sharing settings
  access?: 'public' | 'private';
  allowObjectAcl?: boolean;
  defaultTier?: StorageClass;
  disableDirectoryListing?: boolean;
  // storage settings
  locations?: BucketLocations;
  cacheControl?: string;
  customDomain?: string;
  enableAdditionalHeaders?: boolean;
  softDelete?: { enabled: true; retentionDays: number } | { enabled: false };
  /**
   * @deprecated Use `softDelete` instead.
   */
  enableDeleteProtection?: boolean;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function updateBucket(
  bucketName: string,
  options?: UpdateBucketOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { data: client, error } = createStorageClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const body: UpdateBucketRequestBody = {};
  const headers: Record<string, string> = {};

  // access and sharing settings
  if (options?.access !== undefined) {
    headers[TigrisHeaders.ACL] =
      options.access === 'public' ? 'public-read' : 'private';
  }

  if (options?.allowObjectAcl !== undefined) {
    body.acl_settings = { allow_object_acl: options.allowObjectAcl };
  }

  if (options?.disableDirectoryListing !== undefined) {
    headers[TigrisHeaders.ACL_LIST_OBJECTS] =
      options.disableDirectoryListing === true ? 'false' : 'true';
  }

  // storage settings
  if (options?.locations && options?.locations !== undefined) {
    const validation = validateLocationValues(options.locations);
    if (validation.valid) {
      body.object_regions =
        options.locations.type === 'global'
          ? ''
          : Array.isArray(options.locations.values)
            ? options.locations.values.join(',')
            : options.locations.values;
    } else {
      return {
        error: new Error(validation.error),
      };
    }
  }

  if (options?.cacheControl !== undefined) {
    body.cache_control = options.cacheControl;
  }

  // custom domain
  if (options?.customDomain !== undefined) {
    body.website = { domain_name: options.customDomain };
  }

  if (options?.defaultTier !== undefined) {
    body.storage_class = options.defaultTier;
  }

  // deletion settings
  if (options?.enableDeleteProtection !== undefined) {
    body.protection = { protected: options.enableDeleteProtection };
  }

  // soft delete
  if (options?.softDelete !== undefined) {
    if (options.softDelete.enabled === true) {
      body.soft_delete = {
        enabled: true,
        retention_days: options.softDelete.retentionDays,
      };
    } else {
      body.soft_delete = {
        enabled: false,
      };
    }
  }

  // additional headers
  if (options?.enableAdditionalHeaders !== undefined) {
    body.additional_http_headers =
      options.enableAdditionalHeaders === true
        ? { 'X-Content-Type-Options': 'nosniff' }
        : null;
  }

  const response = await client.request<
    Record<string, unknown>,
    { status: 'success' | 'error'; message?: string }
  >({
    method: 'PATCH',
    path: `/${bucketName}`,
    body,
    headers,
  });

  if (response.error) {
    return { error: response.error };
  }

  if (response.data.status === 'error') {
    return {
      error: new Error(response.data.message ?? 'Failed to update bucket'),
    };
  }

  return {
    data: {
      bucket: bucketName,
      updated: true,
    },
  };
}
