import { StorageClass } from '../types';

type BucketApiNotifications =
  | {
      enabled: boolean;
      web_hook: string;
      filter?: string;
    }
  | {
      enabled: boolean;
      web_hook: string;
      filter?: string;
      auth: {
        token: string;
      };
    }
  | {
      enabled: boolean;
      web_hook: string;
      filter?: string;
      auth: {
        basic_user: string;
        basic_pass: string;
      };
    };

type BucketApiCorsRule = {
  allowedOrigin: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAge?: number;
};

type BucketApiSettings = {
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
    status: 1 | 2; // 1: active, 2: disabled
  }[];
  cors?: {
    rules: BucketApiCorsRule[];
  } | null;
  website?: { domain_name: string };
  protection?: { protected: boolean };
  object_notifications?: BucketApiNotifications;
};

export type GetBucketInfoApiResponseBody = BucketApiSettings & {
  additional_http_headers?: Record<string, string>;
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
  estimated_unique_rows?: number; // number of objects
  estimated_size?: number; // estimated size of the bucket in bytes
  estimated_rows?: number; // estimated number of objects in the bucket (all versions)
};

export type UpdateBucketBody = BucketApiSettings;
