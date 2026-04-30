export const multiRegions = ['usa', 'eur'] as const;
export const singleOrDualRegions = [
  'ams',
  'fra',
  'gru',
  'iad',
  'jnb',
  'lhr',
  'nrt',
  'ord',
  'sin',
  'sjc',
  'syd',
] as const;

export type StorageClass =
  | 'STANDARD'
  | 'STANDARD_IA'
  | 'GLACIER'
  | 'GLACIER_IR';

export type BucketLocationMulti = (typeof multiRegions)[number];

export type BucketLocationDualOrSingle = (typeof singleOrDualRegions)[number];

export type BucketLocations =
  | {
      // Highest availability with data residency across regions in the chosen geo. Strong consistency globally.
      type: 'multi';
      values: BucketLocationMulti;
    }
  | {
      // High availability with data residency across regions of choice. Strong consistency for requests in same region, eventual consistency globally.
      type: 'dual';
      values: BucketLocationDualOrSingle | BucketLocationDualOrSingle[];
    }
  | {
      // Data redundancy across availability zones in a single region. Strong consistency globally.
      type: 'single';
      values: BucketLocationDualOrSingle;
    }
  | {
      // Data distributed globally. Strong consistency for requests in same region, eventual consistency globally.
      type: 'global';
      values?: never;
    };

export type BucketMigration = {
  enabled: boolean;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  name?: string;
  endpoint?: string;
  writeThrough?: boolean;
};

export type BucketTtl = {
  id?: string;
  enabled?: boolean;
  days?: number;
  date?: string;
};

export type BucketLifecycleRule = {
  id?: string;
  enabled?: boolean;
  storageClass?: Exclude<StorageClass, 'STANDARD'>;
  days?: number;
  date?: string;
};

export type BucketCorsRule = {
  allowedOrigins: string | string[];
  allowedMethods?: string | string[];
  allowedHeaders?: string | string[];
  exposeHeaders?: string | string[];
  maxAge?: number;
};

type BucketNotificationBase = {
  enabled?: boolean;
  url?: string;
  filter?: string;
};

type BucketNotificationBasicAuth = BucketNotificationBase & {
  auth: {
    username: string;
    password: string;
    token?: never;
  };
};

type BucketNotificationTokenAuth = BucketNotificationBase & {
  auth: {
    token: string;
    username?: never;
    password?: never;
  };
};

export type BucketNotification =
  | BucketNotificationBase
  | BucketNotificationBasicAuth
  | BucketNotificationTokenAuth;

/**
 * Recognized event types Tigris fires for object notifications.
 *
 * The union is open — when Tigris adds new event types, consumers
 * keep autocomplete on the known values without crashing on unknowns.
 * See https://www.tigrisdata.com/docs/buckets/object-notifications/
 */
export type NotificationEventName =
  | 'OBJECT_CREATED_PUT'
  | 'OBJECT_DELETED'
  // Open-union pattern: `string & {}` preserves autocomplete on the
  // literal members above while still accepting future event types
  // Tigris adds without a breaking change.
  | (string & {});

/**
 * A single event in a bucket-notification webhook delivery. Mirrors the
 * wire format Tigris POSTs to the configured webhook URL — no
 * normalization, no flattening. Cast `await req.json()` to
 * `NotificationResponse` (or run a runtime validator like Zod) at the
 * receiving end and switch on `eventName`.
 *
 * See https://www.tigrisdata.com/docs/buckets/object-notifications/
 */
export type NotificationEvent = {
  /** Schema version of the event payload. */
  eventVersion: string;
  /** Source identifier (`"tigris"` today). */
  eventSource: string;
  /** Event type. Open union: see {@link NotificationEventName}. */
  eventName: NotificationEventName;
  /** RFC 3339 timestamp the event occurred at. */
  eventTime: string;
  /** Bucket the object belongs to. */
  bucket: string;
  /** Object metadata. */
  object: {
    /** Object key inside the bucket. */
    key: string;
    /** Object size in bytes. */
    size: number;
    /** Object ETag (typically MD5 hex). */
    eTag: string;
  };
};

/**
 * Top-level shape of a bucket-notification webhook POST body. A single
 * delivery may carry multiple events — iterate `response.events`.
 *
 * See https://www.tigrisdata.com/docs/buckets/object-notifications/
 */
export type NotificationResponse = {
  events: NotificationEvent[];
};

export type UpdateBucketResponse = {
  bucket: string;
  updated: boolean;
};
