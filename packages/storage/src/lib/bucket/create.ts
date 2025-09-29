import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type CreateBucketOptions = {
  enableSnapshot?: boolean;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function createBucket(
  bucket: string,
  options?: CreateBucketOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const command = new CreateBucketCommand({
    Bucket: bucket,
  });

  if (options?.enableSnapshot) {
    command.middlewareStack.add(
      (next) => async (args) => {
        (args.request as HttpRequest).headers['X-Tigris-Enable-Snapshot'] =
          'true';
        return next(args);
      },
      { step: 'build' }
    );
  }

  return tigrisClient
    .send(command)
    .then(() => {
      return { data: undefined };
    })
    .catch((error) => {
      return { error: new Error(`Unable to create bucket ${error}`) };
    });
}
