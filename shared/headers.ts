export enum TigrisHeaders {
  ACL = 'X-Amz-Acl',
  ACL_LIST_OBJECTS = 'X-Amz-Acl-Public-List-Objects-Enabled',
  AUTHORIZATION = 'authorization',
  SESSION_TOKEN = 'x-amz-security-token',
  NAMESPACE = 'X-Tigris-Namespace',
  STORAGE_CLASS = 'X-Amz-Storage-Class',
  RESTORE = 'X-Amz-Restore',
  /** Prefix for user metadata headers; concatenate with a key, e.g. `${TigrisHeaders.META_PREFIX}author`. */
  META_PREFIX = 'x-amz-meta-',

  /**
   * Switches an object operation over to the bucket's soft-delete view — the
   * recoverable copies kept after a delete, rather than the live objects.
   */
  SOFT_DELETE = 'X-Tigris-Soft-Delete',
  /** Which kind of restore to perform, e.g. `soft-delete`. */
  RESTORE_TYPE = 'X-Tigris-Restore-Type',
  /** The soft-deleted version to bring back. */
  RESTORE_VERSION = 'X-Tigris-Restore-Version',

  BUCKET_LIST_SOURCE = 'X-Tigris-List-Source', // tigris or shadow
  SCHEDULE_MIGRATION = 'X-Tigris-Schedule-Migration',
  SERVED_FROM = 'X-Tigris-Served-From',
  READ_SOURCE = 'X-Tigris-Read-Source',

  REGIONS = 'X-Tigris-Regions',

  SNAPSHOT = 'X-Tigris-Snapshot',
  FORK = 'X-Tigris-Fork',
  SNAPSHOT_VERSION = 'X-Tigris-Snapshot-Version',
  SNAPSHOT_ENABLED = 'X-Tigris-Enable-Snapshot',
  HAS_FORKS = 'X-Tigris-Is-Fork-Parent',
  FORK_SOURCE_BUCKET = 'X-Tigris-Fork-Source-Bucket',
  FORK_SOURCE_BUCKET_SNAPSHOT = 'X-Tigris-Fork-Source-Bucket-Snapshot',

  FORK_MERGE_SOURCE_BUCKET = 'X-Tigris-Merge-Source-Bucket',

  REBASE = 'X-Tigris-Rebase',

  RENAME = 'X-Tigris-Rename',
  COPY_SOURCE = 'X-Amz-Copy-Source',
  BUNDLE_FORMAT = 'X-Tigris-Bundle-Format',
  BUNDLE_COMPRESSION = 'X-Tigris-Bundle-Compression',
  BUNDLE_ON_ERROR = 'X-Tigris-Bundle-On-Error',
}
