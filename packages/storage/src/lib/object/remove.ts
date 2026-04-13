import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { handleError } from '@shared/utils';

export type RemoveOptions = {
  config?: TigrisStorageConfig;
};

export async function remove(
  path: string,
  options?: RemoveOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }
  const remove = new DeleteObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });

  try {
    return tigrisClient
      .send(remove)
      .then(() => {
        return { data: undefined };
      })
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}
