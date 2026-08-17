import { TigrisClientBase } from '@shared/client/base';
import {
  type BoundOperations,
  bindOperations,
} from '@shared/client/bind-operations';
import type {
  TigrisAuth,
  TigrisCredentials,
  TigrisSession,
} from '@shared/client/init-types';
import type { TigrisResponse } from '@shared/types';
import { DEFAULT_STORAGE_ENDPOINT } from './config';
import type {
  CreateBucketSnapshotOptions,
  CreateBucketSnapshotResponse,
  GetOptions,
  GetResponseWithMetadata,
  ListBucketSnapshotsOptions,
  ListBucketSnapshotsResponse,
  ListForksOptions,
  ListForksResponse,
} from './operations';
import * as storageOperations from './operations';
import type { TigrisStorageResponse } from './types';

type BoundGetOptions = Omit<GetOptions, 'config'> & { bucket?: string };

/**
 * What {@link TigrisStorage.buildConfig} actually, always produces:
 * `endpoint` is always resolved (defaulted); `bucket`/`forcePathStyle`
 * are forwarded as given; the auth half is exactly what
 * `resolveAuthFields()` returns — a `TigrisCredentials` or a
 * `TigrisSession`, never a mix, and never a `credentialProvider` (the
 * class resolves dynamic auth to a concrete session itself, see
 * `TigrisClientBase`, so the bare-function's own provider mechanism is
 * never exercised here).
 */
type BuiltStorageConfig = {
  endpoint: string;
  bucket?: string;
  forcePathStyle?: boolean;
} & (TigrisCredentials | TigrisSession);

// `listForks`/`createBucketSnapshot`/`listBucketSnapshots` target a named
// *source* bucket, not the client's own default bucket — their bare-function
// `config` type already omits `bucket` for the same reason, so the bound
// options don't add a `bucket` override either; `sourceBucketName` is the
// only way to target one, same as the bare-function API.
type BoundListForksOptions = Omit<ListForksOptions, 'config'>;
type BoundCreateBucketSnapshotOptions = Omit<
  CreateBucketSnapshotOptions,
  'config'
>;
type BoundListBucketSnapshotsOptions = Omit<
  ListBucketSnapshotsOptions,
  'config'
>;

/**
 * Init options for {@link TigrisStorage}. Deliberately separate from
 * `TigrisStorageConfig` (the bare-function API's config type) — this
 * shape only exists at construct time and is translated into a config
 * per call via {@link TigrisStorage.buildConfig}.
 */
export type TigrisStorageInit = {
  auth: TigrisAuth;
  /** Default bucket for object operations; override per call via `{ bucket }`. */
  bucket?: string;
  /** Storage-operation endpoint override; no other endpoint concept applies here. */
  endpoints?: { endpoint?: string };
  forcePathStyle?: boolean;
};

/**
 * The public shape of `TigrisStorage` is derived structurally from
 * `./operations`'s own exports — adding a new bare function there and
 * it shows up here (and at runtime, via {@link bindOperations} in the
 * constructor) with no other changes required.
 *
 * Exceptions: `get`, `listForks`, `createBucketSnapshot`, and
 * `listBucketSnapshots` are TS-overloaded in their bare-function form.
 * TypeScript's `infer` against an overloaded function type only sees
 * the *last* declared overload, so the generic mapped type collapses
 * these to an incomplete signature (`get` would only accept
 * `format: 'stream'`). Hand-written below instead — runtime attachment
 * is unaffected and stays fully automatic; only these 4 signatures need
 * updating by hand if their bare-function overloads change shape.
 */
export interface TigrisStorage
  extends Omit<
    BoundOperations<typeof storageOperations, 'handleClientUpload'>,
    'get' | 'listForks' | 'createBucketSnapshot' | 'listBucketSnapshots'
  > {
  get(
    path: string,
    format: 'string',
    options: BoundGetOptions & { includeMetadata: true }
  ): Promise<TigrisStorageResponse<GetResponseWithMetadata<string>, Error>>;
  get(
    path: string,
    format: 'file',
    options: BoundGetOptions & { includeMetadata: true }
  ): Promise<TigrisStorageResponse<GetResponseWithMetadata<File>, Error>>;
  get(
    path: string,
    format: 'stream',
    options: BoundGetOptions & { includeMetadata: true }
  ): Promise<
    TigrisStorageResponse<GetResponseWithMetadata<ReadableStream>, Error>
  >;
  get(
    path: string,
    format: 'string',
    options?: BoundGetOptions
  ): Promise<TigrisStorageResponse<string, Error>>;
  get(
    path: string,
    format: 'file',
    options?: BoundGetOptions
  ): Promise<TigrisStorageResponse<File, Error>>;
  get(
    path: string,
    format: 'stream',
    options?: BoundGetOptions
  ): Promise<TigrisStorageResponse<ReadableStream, Error>>;

  listForks(
    options?: BoundListForksOptions
  ): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
  listForks(
    sourceBucketName?: string,
    options?: BoundListForksOptions
  ): Promise<TigrisStorageResponse<ListForksResponse, Error>>;

  createBucketSnapshot(
    options?: BoundCreateBucketSnapshotOptions
  ): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>>;
  createBucketSnapshot(
    sourceBucketName?: string,
    options?: BoundCreateBucketSnapshotOptions
  ): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>>;

  listBucketSnapshots(
    options?: BoundListBucketSnapshotsOptions
  ): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>>;
  listBucketSnapshots(
    sourceBucketName?: string,
    options?: BoundListBucketSnapshotsOptions
  ): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>>;
}

/**
 * Class-based client for `@tigrisdata/storage`. Wraps every function
 * exported from `./operations` with construct-time auth/endpoint config,
 * so per-call options stay focused on per-call concerns.
 *
 * ```ts
 * const storage = new TigrisStorage({ auth: { accessKeyId, secretAccessKey }, bucket: 'my-bucket' });
 * const { data } = await storage.get('key', 'string');
 * ```
 */
export class TigrisStorage extends TigrisClientBase<TigrisStorageInit> {
  constructor(init: TigrisStorageInit) {
    super(init);
    Object.assign(
      this,
      bindOperations(storageOperations, (bucket) => this.buildConfig(bucket), {
        bareConfigParams: ['handleClientUpload'],
      })
    );
  }

  private async buildConfig(
    bucketOverride?: string
  ): Promise<TigrisResponse<BuiltStorageConfig, Error>> {
    const { data: authFields, error } = await this.resolveAuthFields();
    if (error) return { error };

    const bucket = bucketOverride ?? this.init.bucket;
    return {
      data: {
        endpoint: this.init.endpoints?.endpoint ?? DEFAULT_STORAGE_ENDPOINT,
        forcePathStyle: this.init.forcePathStyle,
        ...(bucket !== undefined && { bucket }),
        ...authFields,
      },
    };
  }
}
