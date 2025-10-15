import { DeleteBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type RemoveBucketOptions = {
  config?: TigrisStorageConfig;
};

export async function removeBucket(
  bucketName: string,
  options?: RemoveBucketOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error || !tigrisClient) {
    return { error };
  }

  const command = new DeleteBucketCommand({
    Bucket: bucketName,
  });

  command.middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;
      req.headers['Tigris-Force-Delete'] = 'true';
      const result = await next(args);
      return result;
    },
    {
      name: 'Tigris-Force-Delete-Middleware',
      step: 'build',
      override: true,
    }
  );

  return tigrisClient
    .send(command)
    .then(() => {
      return { data: undefined };
    })
    .catch((error) => {
      return { error: new Error(`Unable to remove bucket ${error}`) };
    });
}
