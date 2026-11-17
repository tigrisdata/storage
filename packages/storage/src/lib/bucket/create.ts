import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders, toError } from '@shared/index';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import type { BucketLocations, BucketSoftDelete, StorageClass } from './types';
import { updateBucket } from './update';
import { validateLocationValues } from './utils/regions';

export type CreateBucketOptions = {
  enableSnapshot?: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
  access?: 'public' | 'private';
  defaultTier?: StorageClass;
  locations?: BucketLocations;
  enableDirectoryListing?: boolean;
  allowObjectAcl?: boolean;
  /**
   * Replicate objects' user metadata (the `metadata` passed to `put`, stored
   * as `x-amz-meta-*`) to every region instead of only the regions that hold
   * the bucket's data. With it, `list({ includeMetadata: true })` returns
   * complete results from any region; without it, that listing is empty
   * outside the bucket's location.
   *
   * Fixed at creation — it cannot be turned on or off later — and it does not
   * apply to forks. The metadata is stored in every region, so large values
   * slow down every listing of the bucket.
   */
  enableGlobalUserMetadata?: boolean;
  /**
   * Keep deleted objects recoverable for `retentionDays` (7–90). Same shape as
   * the `softDelete` option of `updateBucket`, and set as part of the create
   * request itself.
   *
   * It still takes a few seconds to reach the data plane — an object deleted
   * immediately after `createBucket` returns is deleted for good.
   */
  softDelete?: BucketSoftDelete;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type CreateBucketResponse = {
  isSnapshotEnabled: boolean;
  hasForks: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
};

const SOFT_DELETE_MIN_RETENTION_DAYS = 7;
const SOFT_DELETE_MAX_RETENTION_DAYS = 90;

export async function createBucket(
  bucketName: string,
  options?: CreateBucketOptions
): Promise<TigrisStorageResponse<CreateBucketResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  if (options?.locations && options?.locations !== undefined) {
    const validation = validateLocationValues(options.locations);
    if (!validation.valid) {
      return {
        error: new Error(validation.error),
      };
    }
  }

  if (
    options?.sourceBucketSnapshot &&
    options.sourceBucketSnapshot !== '' &&
    (!options?.sourceBucketName || options.sourceBucketName === '')
  ) {
    return {
      error: new Error(
        'sourceBucketName is required when sourceBucketSnapshot is provided'
      ),
    };
  }

  if (options?.softDelete?.enabled) {
    const { retentionDays } = options.softDelete;
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < SOFT_DELETE_MIN_RETENTION_DAYS ||
      retentionDays > SOFT_DELETE_MAX_RETENTION_DAYS
    ) {
      return {
        error: new Error(
          `softDelete.retentionDays must be a whole number between ${SOFT_DELETE_MIN_RETENTION_DAYS} and ${SOFT_DELETE_MAX_RETENTION_DAYS}`
        ),
      };
    }
  }

  const command = new CreateBucketCommand({
    Bucket: bucketName,
  });

  if (options?.access === 'public') {
    command.input.ACL = 'public-read';
  }

  command.middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;

      // Disable directory listing by default
      req.headers[TigrisHeaders.ACL_LIST_OBJECTS] = 'false';

      if (options?.enableDirectoryListing !== undefined) {
        req.headers[TigrisHeaders.ACL_LIST_OBJECTS] =
          options.enableDirectoryListing === true ? 'true' : 'false';
      }

      // Set storage class
      if (options?.defaultTier) {
        req.headers[TigrisHeaders.STORAGE_CLASS] = options.defaultTier;
      }

      // Set locations
      if (
        options?.locations &&
        options?.locations !== undefined &&
        options.locations.type !== 'global'
      ) {
        req.headers[TigrisHeaders.REGIONS] = Array.isArray(
          options.locations.values
        )
          ? options.locations.values.join(',')
          : options.locations.values;
      }

      // Set snapshot enabled
      if (options?.enableSnapshot) {
        req.headers[TigrisHeaders.SNAPSHOT_ENABLED] = 'true';
      }

      // Replicate user metadata to every region
      if (options?.enableGlobalUserMetadata) {
        req.headers[TigrisHeaders.GLOBAL_USER_METADATA] = 'true';
      }

      // Enable soft delete. On CreateBucket the header carries the retention
      // period in days rather than the `true` it takes on other operations.
      if (options?.softDelete?.enabled) {
        req.headers[TigrisHeaders.SOFT_DELETE] = String(
          options.softDelete.retentionDays
        );
      }

      // Set fork source bucket
      if (options?.sourceBucketName && options.sourceBucketName !== '') {
        req.headers[TigrisHeaders.FORK_SOURCE_BUCKET] =
          options.sourceBucketName;
      }

      // Set fork source bucket snapshot
      if (
        options?.sourceBucketName &&
        options.sourceBucketName !== '' &&
        options?.sourceBucketSnapshot &&
        options.sourceBucketSnapshot !== ''
      ) {
        req.headers[TigrisHeaders.FORK_SOURCE_BUCKET_SNAPSHOT] =
          options.sourceBucketSnapshot;
      }

      return await next(args);
    },
    { step: 'build' }
  );

  try {
    return tigrisClient
      .send(command)
      .then(async () => {
        // Object ACL settings can't be set on the S3 CreateBucket command,
        // so when they're requested we apply them with a follow-up
        // updateBucket PATCH once the bucket exists.
        if (options?.allowObjectAcl === true) {
          try {
            const { error: updateError } = await updateBucket(bucketName, {
              allowObjectAcl: true,
              config: options?.config,
            });

            if (updateError) {
              throw updateError;
            }
          } catch (updateError) {
            // updateBucket can either return an error or throw (e.g. a
            // network failure in the underlying request). Funnel both into
            // the same partial-failure message so a created-but-not-updated
            // bucket isn't misreported as a creation failure.
            return {
              error: new Error(
                `Bucket created but failed to set object ACL settings: ${toError(updateError).message}`
              ),
            };
          }
        }

        return {
          data: {
            isSnapshotEnabled: !!options?.enableSnapshot,
            hasForks: false,
            ...(options?.sourceBucketName
              ? { sourceBucketName: options?.sourceBucketName }
              : {}),
            ...(options?.sourceBucketSnapshot
              ? { sourceBucketSnapshot: options?.sourceBucketSnapshot }
              : {}),
          },
        };
      })
      .catch((error) => {
        return {
          error: new Error(`Unable to create bucket ${error.message}`),
        };
      });
  } catch {
    return { error: new Error('Unable to create bucket') };
  }
}
