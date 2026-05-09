import { PutObjectAclCommand } from '@aws-sdk/client-s3';
import { handleError } from '@shared/utils';
import { config, missingConfigError } from '../../config';
import { createTigrisClient } from '../../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';

export type SetObjectAccessOptions = {
  config?: TigrisStorageConfig;
  access: 'public' | 'private';
};

export type SetObjectAccessResponse = {
  path: string;
};

export async function setObjectAccess(
  path: string,
  options: SetObjectAccessOptions
): Promise<TigrisStorageResponse<SetObjectAccessResponse, Error>> {
  if (!options?.access) {
    return { error: new Error('No access option provided') };
  }

  const bucket = options?.config?.bucket ?? config.bucket;

  if (!bucket) {
    return missingConfigError('bucket');
  }

  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  try {
    await tigrisClient.send(
      new PutObjectAclCommand({
        Bucket: bucket,
        Key: path,
        ACL: options.access === 'public' ? 'public-read' : 'private',
      })
    );
  } catch (error) {
    return handleError(error as Error);
  }

  return {
    data: {
      path,
    },
  };
}
