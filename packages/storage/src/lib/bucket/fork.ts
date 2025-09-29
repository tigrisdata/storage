import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { HttpRequest } from '@aws-sdk/types';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type CreateBucketForkOptions = {
  config?: TigrisStorageConfig;
};

export async function createBucketFork(
  forkName: string,
  options?: CreateBucketForkOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const bucketName = options?.config?.bucket ?? config.bucket;

  const command = new CreateBucketCommand({ Bucket: forkName });
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers['X-Tigris-Fork-Source-Bucket'] =
        bucketName!;
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
        error: new Error(`Unable to fork bucket ${bucketName} - ${error}`),
      };
    });
}
