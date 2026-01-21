import { TigrisHeaders } from '@shared/headers';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type UpdateBucketOptions = {
  // access and sharing settings
  access?: 'public' | 'private';
  allowObjectAcl?: boolean;
  disableDirectoryListing?: boolean;

  // storage settings
  // consistency?: 'strict' | 'default';
  regions?: string | string[];
  cacheControl?: string;

  // data management settings
  // TODO: Data Migration, TTL Config, Objects Lifecycle

  // custom domain
  customDomain?: string;

  // cors settings
  // TODO: Additional Headers, CORS Rules

  // notification settings
  // TODO: enableNotifications?: boolean;

  // deletion settings
  enableDeleteProtection?: boolean;

  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type UpdateBucketResponse = {
  bucket: string;
  updated: boolean;
};

export async function updateBucket(
  bucketName: string,
  options?: UpdateBucketOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { data: client, error } = createStorageClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const body: Record<string, unknown> = {};
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
  /*if (options?.consistency !== undefined) {
    body.consistent = options.consistency === 'strict' ? true : false;
  }*/

  if (options?.regions !== undefined) {
    body.object_regions = Array.isArray(options.regions)
      ? options.regions.join(',')
      : options.regions;
  }

  if (options?.cacheControl !== undefined) {
    body.cache_control = options.cacheControl;
  }

  // custom domain
  if (options?.customDomain !== undefined) {
    body.website = { domain_name: options.customDomain };
  }

  // deletion settings
  if (options?.enableDeleteProtection !== undefined) {
    body.protection = { protected: options.enableDeleteProtection };
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
