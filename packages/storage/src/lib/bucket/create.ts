import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

const availableRegions = [
  'usa',
  'eur',
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
];

export type StorageClass =
  | 'STANDARD'
  | 'STANDARD_IA'
  | 'GLACIER'
  | 'GLACIER_IR';

export type CreateBucketOptions = {
  enableSnapshot?: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
  access?: 'public' | 'private';
  defaultTier?: StorageClass;
  /**
   * @deprecated This property is deprecated and will be removed in the next major version
   * @see https://www.tigrisdata.com/docs/buckets/create-bucket/#bucket-consistency
   */
  consistency?: 'strict' | 'default';
  region?: string | string[];
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
    if (Array.isArray(options.region)) {
      if (
        !options.region.every((region) => availableRegions.includes(region))
      ) {
        return {
          error: new Error(
            'Invalid regions specified, possible values are: ' +
              availableRegions.join(', ')
          ),
        };
      }
    } else {
      if (!availableRegions.includes(options.region)) {
        return {
          error: new Error(
            'Invalid region specified, possible values are: ' +
              availableRegions.join(', ')
          ),
        };
      }
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
