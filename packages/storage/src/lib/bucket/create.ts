import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { availableRegions, validateLocationValues, validateRegions } from './utils/regions';
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
      'The region property is deprecated and will be removed in the next major version. Use object_regions instead.'
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

  const command = new CreateBucketCommand({
    Bucket: bucketName,
  });

  if (options?.access === 'public') {
    command.input.ACL = 'public-read';
  }

  command.middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;

      if (options?.defaultTier) {
        req.headers[TigrisHeaders.STORAGE_CLASS] = options.defaultTier;
      }

      if (options?.consistency === 'strict') {
        req.headers[TigrisHeaders.CONSISTENT] = 'true';
      }

      if (options?.region && options?.region !== undefined) {
        req.headers[TigrisHeaders.REGIONS] = Array.isArray(options.region)
          ? options.region.join(',')
          : options.region;
      }

      if (options?.locations && options?.locations !== undefined && options.locations.type !== 'global') {
        req.headers[TigrisHeaders.REGIONS] = Array.isArray(
          options.locations.values
        )
          ? options.locations.values.join(',')
          : options.locations.values;
      }

      const result = await next(args);
      return result;
    },
    {
      step: 'build',
    }
  );

  if (options?.enableSnapshot) {
    command.middlewareStack.add(
      (next) => async (args) => {
        (args.request as HttpRequest).headers[TigrisHeaders.SNAPSHOT_ENABLED] =
          'true';
        return next(args);
      },
      { step: 'build' }
    );
  }

  if (options?.sourceBucketName && options.sourceBucketName !== '') {
    const sourceBucketName = options.sourceBucketName;
    command.middlewareStack.add(
      (next) => async (args) => {
        (args.request as HttpRequest).headers[
          TigrisHeaders.FORK_SOURCE_BUCKET
        ] = sourceBucketName;

        if (
          options?.sourceBucketSnapshot &&
          options.sourceBucketSnapshot !== ''
        ) {
          (args.request as HttpRequest).headers[
            TigrisHeaders.FORK_SOURCE_BUCKET_SNAPSHOT
          ] = options.sourceBucketSnapshot;
        }

        return next(args);
      },
      { step: 'build' }
    );
  }

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
