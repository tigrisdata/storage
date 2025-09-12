import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export type RemoveOptions = {
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
  return tigrisClient
    .send(remove)
    .then(() => undefined)
    .catch(handleError);
}

const handleError = (error: unknown) => {
  if ((error as { Code?: string }).Code === 'AccessDenied') {
    return {
      error: new Error('Access denied while deleting file'),
    };
  }
  return {
    error: new Error('Error deleting file'),
  };
};
