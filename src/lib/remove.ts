import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';
import { config } from './config';

type RemoveOptions = {
  config?: TigrisStorageConfig;
};

export async function remove(
  path: string,
  options?: RemoveOptions
): Promise<TigrisStorageResponse<void, Error> | void> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);
  if (error || !tigrisClient) {
    return { error };
  }
  const remove = new DeleteObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });
  return tigrisClient.send(remove).then(() => undefined);
}
