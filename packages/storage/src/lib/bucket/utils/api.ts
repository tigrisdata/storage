import type { BucketShareRole, StorageClass } from '../types';

type BucketApiNotifications =
  | Record<string, never>
  | { enabled: false }
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
  storage_class?: StorageClass;
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
      storage_class: Exclude<StorageClass, 'STANDARD'>;
      date?: string;
      days?: number;
    }[];
    filter?: {
      prefix?: string;
    };
    status: 1 | 2; // 1: active, 2: disabled
  }[];
  cors?: {
    rules: BucketApiCorsRule[];
  } | null;
  website?: { domain_name: string };
  protection?: { protected: boolean };
  object_notifications?: BucketApiNotifications;
  soft_delete?: { enabled: true; retention_days: number } | { enabled: false };
  additional_http_headers?: { 'X-Content-Type-Options': 'nosniff' } | null;
  shares?: BucketApiShare[];
  type?: 0 | 1;
};

/**
 * A single share on the wire. Exactly one of `team_id` / `user_id` is set;
 * the organization-wide grant is `team_id: 'all'`.
 */
export type BucketApiShare = {
  team_id?: string;
  user_id?: string;
  role: BucketShareRole;
};

/** Wire sentinel in `team_id` meaning "everyone in the organization". */
export const ORGANIZATION_TEAM_ID = 'all';

export type GetBucketInfoApiResponseBody = BucketApiSettings & {
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
  tier_sizes: Record<string, number>;
  estimated_unique_rows?: number; // number of objects
  estimated_size?: number; // estimated size of the bucket in bytes
  estimated_rows?: number; // estimated number of objects in the bucket (all versions)
};

export type UpdateBucketBody = BucketApiSettings;
