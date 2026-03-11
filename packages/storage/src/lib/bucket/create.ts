import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import {
  availableRegions,
  validateLocationValues,
  validateRegions,
} from './utils/regions';
import type { BucketLocations, StorageClass } from './types';

export type CreateBucketOptions = {
  enableSnapshot?: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
  access?: 'public' | 'private';
  defaultTier?: StorageClass;
  /**
   * @deprecated This property is deprecated and will be removed in the next major version. Use locations instead.
   * @see https://www.tigrisdata.com/docs/buckets/locations/
   */
  consistency?: 'strict' | 'default';
  /**
   * @deprecated This property is deprecated and will be removed in the next major version. Use locations instead.
   * @see https://www.tigrisdata.com/docs/buckets/locations/
   */
  region?: string | string[];
  locations?: BucketLocations;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type CreateBucketResponse = {
  isSnapshotEnabled: boolean;
  hasForks: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
};

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

  if (options?.region && options?.region !== undefined) {
    console.warn(
      'The region property is deprecated and will be removed in the next major version. Use locations instead.'
    );
    if (!validateRegions(options.region)) {
      return {
        error: new Error(
          'Invalid regions specified, possible values are: ' +
            availableRegions.join(', ')
        ),
      };
    }
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

      // Set storage class
      if (options?.defaultTier) {
        req.headers[TigrisHeaders.STORAGE_CLASS] = options.defaultTier;
      }

      // Set consistency level
      if (options?.consistency === 'strict') {
        req.headers[TigrisHeaders.CONSISTENT] = 'true';
      }

      // Set regions
      if (options?.region && options?.region !== undefined) {
        req.headers[TigrisHeaders.REGIONS] = Array.isArray(options.region)
          ? options.region.join(',')
          : options.region;
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
      .then(() => {
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
        return { error: new Error(`Unable to create bucket ${error.message}`) };
      });
  } catch {
    return { error: new Error('Unable to create bucket') };
  }
}
