/**
 * The package's full set of bare-function operations. `server.ts`
 * re-exports this wholesale as the public API; `tigris-storage.ts`
 * imports it as a namespace object to bind every function onto
 * `TigrisStorage` (see `bindOperations`). Kept separate from
 * `server.ts` itself so that import stays a straight line rather than
 * a cycle back through the file that also exports `TigrisStorage`.
 */
export type { TigrisConfig } from '@shared/types';
export {
  type CreateBucketOptions,
  type CreateBucketResponse,
  createBucket,
} from './bucket/create';
export {
  type BucketInfoResponse,
  type GetBucketInfoOptions,
  getBucketInfo,
} from './bucket/info';
export {
  type ListBucketsOptions,
  type ListBucketsResponse,
  listBuckets,
} from './bucket/list';
export { type RemoveBucketOptions, removeBucket } from './bucket/remove';
export {
  type RestoreBucketOptions,
  type RestoreBucketResponse,
  restoreBucket,
} from './bucket/restore';
export { type SetBucketCorsOptions, setBucketCors } from './bucket/set/cors';
export {
  type SetBucketLifecycleOptions,
  setBucketLifecycle,
} from './bucket/set/lifecycle';
export {
  type SetBucketMigrationOptions,
  setBucketMigration,
} from './bucket/set/migration';
export {
  type SetBucketNotificationsOptions,
  setBucketNotifications,
} from './bucket/set/notifications';
export { type SetBucketTtlOptions, setBucketTtl } from './bucket/set/ttl';
export {
  type BucketSnapshotOptions,
  BucketTypes,
  disableSnapshot,
  enableSnapshot,
  type SetBucketTypeOptions,
  setBucketType,
} from './bucket/set/type';
export {
  type BucketSnapshot,
  type CreateBucketSnapshotOptions,
  type CreateBucketSnapshotResponse,
  createBucketSnapshot,
  type DeleteBucketSnapshotOptions,
  type DeleteBucketSnapshotResponse,
  deleteBucketSnapshot,
  type ListBucketSnapshotsOptions,
  type ListBucketSnapshotsResponse,
  listBucketSnapshots,
} from './bucket/snapshot';
export type {
  Bucket,
  BucketCorsRule,
  BucketLifecycleExpiration,
  BucketLifecycleFilter,
  BucketLifecycleRule,
  BucketLocations,
  BucketMigration,
  BucketNotification,
  BucketOwner,
  BucketsStats,
  BucketTtl,
  BucketType,
  BucketVisibility,
  NotificationEvent,
  NotificationEventName,
  NotificationResponse,
  StorageClass,
  UpdateBucketResponse,
} from './bucket/types';
export { type UpdateBucketOptions, updateBucket } from './bucket/update';
export {
  type BucketFork,
  type ForkedBucket,
  type ListForksOptions,
  type ListForksResponse,
  listForks,
} from './fork/list';
export {
  type MergeForkOptions,
  type MergeForkResponse,
  mergeFork,
} from './fork/merge';
export {
  type RebaseForkOptions,
  type RebaseForkResponse,
  rebaseFork,
} from './fork/rebase';
export {
  type BundleOptions,
  type BundleResponse,
  bundle,
} from './object/bundle';
export { type CopyOptions, type CopyResponse, copy } from './object/copy';
export {
  type GetMetadata,
  type GetOptions,
  type GetResponse,
  type GetResponseWithMetadata,
  get,
} from './object/get';
export { type HeadOptions, type HeadResponse, head } from './object/head';
export {
  type ListItem,
  type ListOptions,
  type ListResponse,
  list,
} from './object/list';
export {
  type DeleteMarker,
  type ListVersionsOptions,
  type ListVersionsResponse,
  listVersions,
  type ObjectVersion,
} from './object/list-versions';
export { isMigrated, type MigrateOptions, migrate } from './object/migrate';
export { type MoveOptions, type MoveResponse, move } from './object/move';
export {
  type CompleteMultipartUploadOptions,
  type CompleteMultipartUploadResponse,
  completeMultipartUpload,
  type GetPartsPresignedUrlsOptions,
  type GetPartsPresignedUrlsResponse,
  getPartsPresignedUrls,
  type InitMultipartUploadOptions,
  type InitMultipartUploadResponse,
  initMultipartUpload,
} from './object/multipart';
export {
  type GetPresignedUrlOptions,
  type GetPresignedUrlResponse,
  getPresignedUrl,
} from './object/presigned-url';
export { type PutOptions, type PutResponse, put } from './object/put';
export { type RemoveOptions, remove } from './object/remove';
export {
  type GetRestoreInfoOptions,
  getRestoreInfo,
  type RestoreInfo,
  type RestoreObjectOptions,
  type RestoreObjectResponse,
  RestoreStatus,
  restoreObject,
} from './object/restore';
export {
  type SetObjectAccessOptions,
  type SetObjectAccessResponse,
  setObjectAccess,
} from './object/set/access';
export {
  type GetSignedUploadUrlOptions,
  getSignedUploadUrl,
} from './object/signed-upload-url';
export {
  type UpdateObjectOptions,
  type UpdateObjectResponse,
  updateObject,
} from './object/update';
export { type GetStatsOptions, getStats, type StatsResponse } from './stats';
export {
  type ClientUploadRequest,
  handleClientUpload,
} from './upload/server';
export { type SignedUploadUrlResponse, UploadAction } from './upload/shared';
