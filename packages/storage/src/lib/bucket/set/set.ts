import { createStorageClient } from "../../http-client";
import type { TigrisStorageConfig, TigrisStorageResponse } from "../../types";
import type { StorageClass } from "../types";

export type UpdateBucketBodyLifecycleStatus = 1 | 2;

export type UpdateBucketBody = {
  acl_settings?: { allow_object_acl: boolean };
  acl_list_objects?: 'false' | 'true';
  object_regions?: string;
  cache_control?: string;
  shadow_bucket?: {
    access_key?: string;
    secret_key?: string;
    region?: string;
    name?: string;
    endpoint?: string;
    write_through?: boolean;
  };
  lifecycle_rules?: {
    id?: string;
    expiration?: {
      days?: number;
      date?: string;
      enabled: boolean;
    };
    transitions?: {
      storage_class: Omit<StorageClass, 'STANDARD'>;
      date?: string;
      days?: number;
    }[];
    status: UpdateBucketBodyLifecycleStatus; // 1: active, 2: disabled
  }[];
  website?: { domain_name: string };
  protection?: { protected: boolean };
};

export type SetBucketSettingsOptions = {
  headers?: Record<string, string>;
  body?: UpdateBucketBody;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
}

export type UpdateBucketResponse = {
  bucket: string;
  updated: boolean;
};

export async function setBucketSettings(bucketName: string, options?: SetBucketSettingsOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {

  const { data: client, error } = createStorageClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const { headers, body } = options ?? {};

  if (!headers && !body) {
    return {
      error: new Error('No settings provided'),
    };
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
    return { error: response.error.message ? new Error(response.error.message) : response.error };
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
