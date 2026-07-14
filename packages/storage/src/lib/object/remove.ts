import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { handleError } from '@shared/utils';
import { getConfig } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type RemoveOptions = {
  config?: TigrisStorageConfig;
  versionId?: string;
};

export async function remove(
  path: string,
  options?: RemoveOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }
  const remove = new DeleteObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    VersionId: options?.versionId,
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
