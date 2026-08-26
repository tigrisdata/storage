import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { handleError } from '@shared/utils';
import { getConfig } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { addSoftDeleteMiddleware } from './middleware';

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

export type PurgeDeletedObjectOptions = {
  config?: TigrisStorageConfig;
};

export type PurgeDeletedObjectResponse = {
  path: string;
  versionId: string;
};

/**
 * Permanently destroy one soft-deleted version of an object, before its
 * retention window would have expired. This cannot be undone — the version is
 * no longer recoverable with `restoreDeletedObject`.
 *
 * `versionId` comes from `listVersions({ deleted: true, prefix })`; find the
 * deleted keys themselves with `list({ deleted: true })`.
 *
 * Note this is not the same call as `remove(path, { versionId })`. A versioned
 * delete aimed at a soft-deleted version is rejected with `400
 * InvalidArgument` unless it targets the soft-delete view, which is what this
 * does. `remove` is still the right call for hard-deleting a live object's
 * versions on a versioned bucket.
 */
export async function purgeDeletedObject(
  path: string,
  versionId: string,
  options?: PurgeDeletedObjectOptions
): Promise<TigrisStorageResponse<PurgeDeletedObjectResponse, Error>> {
  if (!path) {
    return { error: new Error('Object path is required') };
  }

  if (!versionId) {
    return { error: new Error('versionId is required') };
  }

  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const purge = new DeleteObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    VersionId: versionId,
  });

  addSoftDeleteMiddleware(purge.middlewareStack);

  try {
    return tigrisClient
      .send(purge)
      .then(() => ({
        data: {
          path,
          versionId,
        },
      }))
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}
