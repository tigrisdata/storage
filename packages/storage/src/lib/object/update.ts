import { PutObjectAclCommand } from '@aws-sdk/client-s3';
import { createTigrisClient } from '../tigris-client';
import { TigrisHeaders } from '@shared/headers';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { config, missingConfigError } from '../config';
import { handleError } from '../utils';
import { createStorageClient } from '../http-client';

export type UpdateObjectOptions = {
  config?: TigrisStorageConfig;
  key?: string;
  access?: 'public' | 'private';
};

export type UpdateObjectResponse = {
  path: string;
};

export async function updateObject(
  path: string,
  options?: UpdateObjectOptions
): Promise<TigrisStorageResponse<UpdateObjectResponse, Error>> {
  if (!options?.key && !options?.access) {
    return { error: new Error('No update options provided') };
  }

  const bucket = options?.config?.bucket ?? config.bucket;

  if (!bucket) {
    return missingConfigError('bucket');
  }

  let currentKey = path;

  // Rename first, so the ACL update targets the correct key
  if (options?.key) {
    const key = options.key;
    const { data: storageHttpClient, error: storageHttpClientError } =
      createStorageClient(options?.config);

    if (storageHttpClientError) {
      return { error: storageHttpClientError };
    }

    try {
      const response = await storageHttpClient.request({
        method: 'PUT',
        path: `/${bucket}/${encodeURIComponent(key)}?x-id=CopyObject`,
        headers: {
          [TigrisHeaders.COPY_SOURCE]: `${bucket}/${encodeURIComponent(path)}`,
          [TigrisHeaders.RENAME]: 'true',
        },
      });

      if (response.error) {
        return { error: response.error };
      }

      currentKey = key;
    } catch (error) {
      return handleError(error as Error);
    }
  }

  if (options?.access) {
    const { data: tigrisClient, error } = createTigrisClient(options?.config);

    if (error) {
      return { error };
    }

    try {
      await tigrisClient.send(
        new PutObjectAclCommand({
          Bucket: bucket,
          Key: currentKey,
          ACL: options.access === 'public' ? 'public-read' : 'private',
        })
      );
    } catch (error) {
      return handleError(error as Error);
    }
  }

  return {
    data: {
      path: currentKey,
    },
  };
}
