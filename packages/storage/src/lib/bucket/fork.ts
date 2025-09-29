import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { HttpRequest } from '@aws-sdk/types';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type CreateBucketForkOptions = {
  sourceBucketSnapshot?: string;
  config?: TigrisStorageConfig;
};

export async function createBucketFork(
  forkName: string,
  options?: CreateBucketForkOptions
): Promise<TigrisStorageResponse<void, Error>>;
export async function createBucketFork(
  forkName: string,
  sourceBucketName?: string,
  options?: CreateBucketForkOptions
): Promise<TigrisStorageResponse<void, Error>>;
export async function createBucketFork(
  forkName: string,
  sourceBucketName?: string | CreateBucketForkOptions,
  options?: CreateBucketForkOptions
): Promise<TigrisStorageResponse<void, Error>> {
  if (!forkName) {
    return { error: new Error('Fork name is required') };
  }

  if (typeof sourceBucketName === 'object') {
    options = sourceBucketName;
    sourceBucketName = undefined;
  }

  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  const sourceBucket =
    sourceBucketName ?? options?.config?.bucket ?? config.bucket;

  if (!sourceBucket) {
    return { error: new Error('Source bucket name is required') };
  }

  const command = new CreateBucketCommand({ Bucket: forkName });
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers['X-Tigris-Fork-Source-Bucket'] =
        sourceBucket;

      if (
        options?.sourceBucketSnapshot &&
        options.sourceBucketSnapshot !== ''
      ) {
        (args.request as HttpRequest).headers[
          'X-Tigris-Fork-Source-Bucket-Snapshot'
        ] = options.sourceBucketSnapshot;
      }

      return next(args);
    },
    { step: 'build' }
  );

  return tigrisClient
    .send(command)
    .then(() => {
      return { data: undefined };
    })
    .catch((error) => {
      return {
        error: new Error(`Unable to fork bucket ${sourceBucket} - ${error}`),
      };
    });
}
