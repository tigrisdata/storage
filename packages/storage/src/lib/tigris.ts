import { type Scoped, TigrisBase } from '@shared/index';
import {
  type CreateBucketOptions,
  type CreateBucketResponse,
  createBucket,
} from './bucket/create';
import {
  type ListForksOptions,
  type ListForksResponse,
  listForks,
} from './bucket/forks';
import {
  type BucketInfoResponse,
  type GetBucketInfoOptions,
  getBucketInfo,
} from './bucket/info';
import {
  type ListBucketsOptions,
  type ListBucketsResponse,
  listBuckets,
} from './bucket/list';
import { type RemoveBucketOptions, removeBucket } from './bucket/remove';
import { type SetBucketCorsOptions, setBucketCors } from './bucket/set/cors';
import {
  type SetBucketLifecycleOptions,
  setBucketLifecycle,
} from './bucket/set/lifecycle';
import {
  type SetBucketMigrationOptions,
  setBucketMigration,
} from './bucket/set/migration';
import {
  type SetBucketNotificationsOptions,
  setBucketNotifications,
} from './bucket/set/notifications';
import { type SetBucketTtlOptions, setBucketTtl } from './bucket/set/ttl';
import {
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
import type { UpdateBucketResponse } from './bucket/types';
import { type UpdateBucketOptions, updateBucket } from './bucket/update';
import { DEFAULT_ENDPOINTS } from './config';
import {
  type BundleOptions,
  type BundleResponse,
  bundle,
} from './object/bundle';
import { type CopyOptions, type CopyResponse, copy } from './object/copy';
import { type GetOptions, get } from './object/get';
import { type HeadOptions, type HeadResponse, head } from './object/head';
import { type ListOptions, type ListResponse, list } from './object/list';
import {
  type ListVersionsOptions,
  type ListVersionsResponse,
  listVersions,
} from './object/list-versions';
import { isMigrated, type MigrateOptions, migrate } from './object/migrate';
import { type MoveOptions, type MoveResponse, move } from './object/move';
import {
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
import {
  type GetPresignedUrlOptions,
  type GetPresignedUrlResponse,
  getPresignedUrl,
} from './object/presigned-url';
import { type PutOptions, type PutResponse, put } from './object/put';
import { type RemoveOptions, remove } from './object/remove';
import {
  type SetObjectAccessOptions,
  type SetObjectAccessResponse,
  setObjectAccess,
} from './object/set/access';
import {
  type UpdateObjectOptions,
  type UpdateObjectResponse,
  updateObject,
} from './object/update';
import { type GetStatsOptions, getStats, type StatsResponse } from './stats';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';
import { type ClientUploadRequest, handleClientUpload } from './upload/server';

/**
 * Per-call options for storage object methods. Surfaces `bucket` at
 * the top level for per-call overrides of the construct-time bucket.
 */
type ScopedWithBucket<T> = Scoped<T> & { bucket?: string };

type GetFormat = 'string' | 'file' | 'stream';
type GetReturnFor<F> = F extends 'string'
  ? string
  : F extends 'file'
    ? File
    : ReadableStream;

/**
 * Class-based client for `@tigrisdata/storage`. Wraps the bare-function
 * API with a constructor that holds auth and endpoint config, so per-call
 * options stay focused on per-call concerns. Methods are arrow fields,
 * safe to destructure (`const { get, put } = new Tigris(init)`).
 *
 * Auth modes (see `TigrisInit.auth`):
 *  - `TigrisCredentials` — static accessKeyId / secretAccessKey
 *  - `TigrisSession` — static session token + organization id
 *  - `() => Promise<TigrisSession>` — async resolver with proactive
 *    refresh; use this for short-lived sessions returned by an auth
 *    endpoint.
 *
 * The constructor is lenient — no validation, no throws. Missing or
 * malformed fields surface as `{ error }` from the bare functions on
 * first use, the same way they do for the bare-function API.
 */
export class Tigris extends TigrisBase {
  async #buildConfig(
    bucketOverride?: string
  ): Promise<TigrisStorageResponse<TigrisStorageConfig>> {
    const { data: authFields, error } = await this.resolveAuthFields();
    if (error) return { error };

    const bucket = bucketOverride ?? this.init?.bucket;
    return {
      data: {
        endpoint: this.init?.endpoints?.storage ?? DEFAULT_ENDPOINTS.storage,
        ...(bucket !== undefined && { bucket }),
        forcePathStyle: this.init?.forcePathStyle,
        ...authFields,
      },
    };
  }

  // --- Object methods ---

  get = async <F extends GetFormat>(
    path: string,
    format: F,
    opts?: ScopedWithBucket<GetOptions>
  ): Promise<TigrisStorageResponse<GetReturnFor<F>, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return (await get(path, format as 'string', {
      ...rest,
      config,
    })) as TigrisStorageResponse<GetReturnFor<F>, Error>;
  };

  put = async (
    path: string,
    body: Parameters<typeof put>[1],
    opts?: ScopedWithBucket<PutOptions>
  ): Promise<TigrisStorageResponse<PutResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return put(path, body, { ...rest, config });
  };

  head = async (
    path: string,
    opts?: ScopedWithBucket<HeadOptions>
  ): Promise<TigrisStorageResponse<HeadResponse | undefined, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return head(path, { ...rest, config });
  };

  list = async (
    opts?: ScopedWithBucket<ListOptions>
  ): Promise<TigrisStorageResponse<ListResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return list({ ...rest, config });
  };

  listVersions = async (
    opts?: ScopedWithBucket<ListVersionsOptions>
  ): Promise<TigrisStorageResponse<ListVersionsResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return listVersions({ ...rest, config });
  };

  remove = async (
    path: string,
    opts?: ScopedWithBucket<RemoveOptions>
  ): Promise<TigrisStorageResponse<void, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return remove(path, { ...rest, config });
  };

  copy = async (
    src: string,
    dest: string,
    opts?: ScopedWithBucket<CopyOptions>
  ): Promise<TigrisStorageResponse<CopyResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return copy(src, dest, { ...rest, config });
  };

  move = async (
    src: string,
    dest: string,
    opts?: ScopedWithBucket<MoveOptions>
  ): Promise<TigrisStorageResponse<MoveResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return move(src, dest, { ...rest, config });
  };

  /** @deprecated mirrors the deprecated bare `updateObject`. */
  update = async (
    path: string,
    opts?: ScopedWithBucket<UpdateObjectOptions>
  ): Promise<TigrisStorageResponse<UpdateObjectResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return updateObject(path, { ...rest, config });
  };

  migrate = async (
    path: string,
    opts?: ScopedWithBucket<MigrateOptions>
  ): Promise<TigrisStorageResponse<void, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return migrate(path, { ...rest, config });
  };

  isMigrated = async (
    path: string,
    opts?: ScopedWithBucket<MigrateOptions>
  ): Promise<TigrisStorageResponse<boolean, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return isMigrated(path, { ...rest, config });
  };

  bundle = async (
    keys: string[],
    opts?: ScopedWithBucket<BundleOptions>
  ): Promise<TigrisStorageResponse<BundleResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return bundle(keys, { ...rest, config });
  };

  getPresignedUrl = async (
    path: string,
    opts: ScopedWithBucket<GetPresignedUrlOptions>
  ): Promise<TigrisStorageResponse<GetPresignedUrlResponse, Error>> => {
    const { bucket, ...rest } = opts;
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return getPresignedUrl(path, { ...rest, config } as GetPresignedUrlOptions);
  };

  setObjectAccess = async (
    path: string,
    opts: ScopedWithBucket<SetObjectAccessOptions>
  ): Promise<TigrisStorageResponse<SetObjectAccessResponse, Error>> => {
    const { bucket, ...rest } = opts;
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return setObjectAccess(path, { ...rest, config });
  };

  initMultipartUpload = async (
    path: string,
    opts?: ScopedWithBucket<InitMultipartUploadOptions>
  ): Promise<TigrisStorageResponse<InitMultipartUploadResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return initMultipartUpload(path, { ...rest, config });
  };

  getPartsPresignedUrls = async (
    path: string,
    parts: number[],
    uploadId: string,
    opts?: ScopedWithBucket<GetPartsPresignedUrlsOptions>
  ): Promise<TigrisStorageResponse<GetPartsPresignedUrlsResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return getPartsPresignedUrls(path, parts, uploadId, { ...rest, config });
  };

  completeMultipartUpload = async (
    path: string,
    uploadId: string,
    partIds: Array<{ [key: number]: string }>,
    opts?: ScopedWithBucket<CompleteMultipartUploadOptions>
  ): Promise<TigrisStorageResponse<CompleteMultipartUploadResponse, Error>> => {
    const { bucket, ...rest } = opts ?? {};
    const { data: config, error } = await this.#buildConfig(bucket);
    if (error) return { error };
    return completeMultipartUpload(path, uploadId, partIds, {
      ...rest,
      config,
    });
  };

  handleClientUpload = async (
    request: ClientUploadRequest
  ): Promise<TigrisStorageResponse<unknown, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return handleClientUpload(request, config);
  };

  // --- Bucket-management methods ---

  createBucket = async (
    bucketName: string,
    opts?: Scoped<CreateBucketOptions>
  ): Promise<TigrisStorageResponse<CreateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return createBucket(bucketName, { ...opts, config });
  };

  removeBucket = async (
    bucketName: string,
    opts?: Scoped<RemoveBucketOptions>
  ): Promise<TigrisStorageResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return removeBucket(bucketName, { ...opts, config });
  };

  listBuckets = async (
    opts?: Scoped<ListBucketsOptions>
  ): Promise<TigrisStorageResponse<ListBucketsResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return listBuckets({ ...opts, config });
  };

  /**
   * List forks of a bucket. Defaults to the construct-time bucket when
   * `sourceBucketName` is omitted; pass an explicit name to scope to a
   * different source.
   */
  listForks = async (
    sourceBucketName?: string,
    opts?: Scoped<ListForksOptions>
  ): Promise<TigrisStorageResponse<ListForksResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    const name = sourceBucketName ?? this.init?.bucket;
    if (!name) {
      return { error: new Error('Source bucket name is required') };
    }
    return listForks(name, { ...opts, config });
  };

  getBucketInfo = async (
    bucketName: string,
    opts?: Scoped<GetBucketInfoOptions>
  ): Promise<TigrisStorageResponse<BucketInfoResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return getBucketInfo(bucketName, { ...opts, config });
  };

  updateBucket = async (
    bucketName: string,
    opts?: Scoped<UpdateBucketOptions>
  ): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return updateBucket(bucketName, { ...opts, config });
  };

  setBucketCors = async (
    bucketName: string,
    opts?: Scoped<SetBucketCorsOptions>
  ): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return setBucketCors(bucketName, {
      ...(opts as SetBucketCorsOptions),
      config,
    });
  };

  setBucketLifecycle = async (
    bucketName: string,
    opts?: Scoped<SetBucketLifecycleOptions>
  ): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return setBucketLifecycle(bucketName, {
      ...(opts as SetBucketLifecycleOptions),
      config,
    });
  };

  setBucketMigration = async (
    bucketName: string,
    opts?: Scoped<SetBucketMigrationOptions>
  ): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return setBucketMigration(bucketName, { ...opts, config });
  };

  setBucketNotifications = async (
    bucketName: string,
    opts: Scoped<SetBucketNotificationsOptions>
  ): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return setBucketNotifications(bucketName, {
      ...(opts as SetBucketNotificationsOptions),
      config,
    });
  };

  setBucketTtl = async (
    bucketName: string,
    opts?: Scoped<SetBucketTtlOptions>
  ): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return setBucketTtl(bucketName, { ...opts, config });
  };

  /**
   * Create a snapshot. Defaults to the construct-time bucket when
   * `sourceBucketName` is omitted.
   */
  createBucketSnapshot = async (
    sourceBucketName?: string,
    opts?: Scoped<CreateBucketSnapshotOptions>
  ): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    const name = sourceBucketName ?? this.init?.bucket;
    if (!name) {
      return { error: new Error('Source bucket name is required') };
    }
    return createBucketSnapshot(name, { ...opts, config });
  };

  deleteBucketSnapshot = async (
    sourceBucketName: string,
    snapshotVersion: string,
    opts?: Scoped<DeleteBucketSnapshotOptions>
  ): Promise<TigrisStorageResponse<DeleteBucketSnapshotResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return deleteBucketSnapshot(sourceBucketName, snapshotVersion, {
      ...opts,
      config,
    });
  };

  /**
   * List snapshots of a bucket. Defaults to the construct-time bucket
   * when `sourceBucketName` is omitted.
   */
  listBucketSnapshots = async (
    sourceBucketName?: string,
    opts?: Scoped<ListBucketSnapshotsOptions>
  ): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    const name = sourceBucketName ?? this.init?.bucket;
    if (!name) {
      return { error: new Error('Source bucket name is required') };
    }
    return listBucketSnapshots(name, { ...opts, config });
  };

  getStats = async (
    opts?: Scoped<GetStatsOptions>
  ): Promise<TigrisStorageResponse<StatsResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return getStats({ ...opts, config });
  };
}
