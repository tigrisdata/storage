import { TigrisHeaders } from '@shared/headers';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { BucketLocations } from './types';
import { validateLocationValues } from './utils/regions';

type AdditionalHeaders = { 'X-Content-Type-Options': 'nosniff' };

type UpdateBucketRequestBody = {
  acl_settings?: { allow_object_acl: boolean };
  object_regions?: string;
  cache_control?: string;
  website?: { domain_name: string };
  protection?: { protected: boolean };
  additional_http_headers?: AdditionalHeaders | null;
};

export type UpdateBucketOptions = {
  // access and sharing settings
  access?: 'public' | 'private';
  allowObjectAcl?: boolean;
  disableDirectoryListing?: boolean;
  // storage settings
  /**
   * @deprecated This property is deprecated and will be removed in the next major version. Use locations instead.
   * @see https://www.tigrisdata.com/docs/buckets/locations/
   */
  regions?: string | string[];
  locations?: BucketLocations;
  cacheControl?: string;
  customDomain?: string;
  enableAdditionalHeaders?: boolean;
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
  if (options?.regions !== undefined) {
    console.warn(
      'The regions property is deprecated and will be removed in the next major version. Use object_regions instead.'
    );
    body.object_regions = Array.isArray(options.regions)
      ? options.regions.join(',')
      : options.regions;
  }

  if (options?.locations && options?.locations !== undefined) {
    const validation = validateLocationValues(options.locations);
    if (validation.valid) {
      body.object_regions = Array.isArray(options.locations.values)
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

  // deletion settings
  if (options?.enableDeleteProtection !== undefined) {
    body.protection = { protected: options.enableDeleteProtection };
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
