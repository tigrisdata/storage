import { HeadObjectCommand, RestoreObjectCommand } from '@aws-sdk/client-s3';
import type { HttpResponse } from '@aws-sdk/types';
import { handleError, TigrisHeaders } from '@shared/index';
import { getConfig } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { addSnapshotVersionMiddleware } from './middleware';

export type RestoreObjectOptions = {
  /**
   * How many days the restored (active) copy stays available before it
   * reverts to its archived tier. Defaults to `1`.
   */
  days?: number;
  /**
   * Restore a specific object version instead of the current one.
   */
  versionId?: string;
  snapshotVersion?: string;
  config?: TigrisStorageConfig;
};

export type RestoreObjectResponse = {
  path: string;
};

/**
 * Restore an archived object (e.g. one stored in the `GLACIER` tier) back into
 * an actively-readable copy for a number of days.
 */
export async function restoreObject(
  path: string,
  options?: RestoreObjectOptions
): Promise<TigrisStorageResponse<RestoreObjectResponse, Error>> {
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const restore = new RestoreObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    VersionId: options?.versionId,
    RestoreRequest: {
      Days: options?.days ?? 1,
    },
  });

  if (options?.snapshotVersion) {
    addSnapshotVersionMiddleware(
      restore.middlewareStack,
      options.snapshotVersion
    );
  }

  try {
    return tigrisClient
      .send(restore)
      .then(() => {
        return {
          data: {
            path,
          },
        };
      })
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}

export enum RestoreStatus {
  /** A restore has been requested and is still being processed. */
  InProgress = 'in-progress',
  /** The object has been restored and is currently readable. */
  Restored = 'restored',
  /** The object is archived (e.g. `GLACIER`) and has not been restored. */
  Archived = 'archived',
}

export type RestoreInfo = {
  status: RestoreStatus;
  /**
   * When the restored copy expires and reverts to its archived tier. Only set
   * when `status` is `RestoreStatus.Restored`.
   */
  expiresAt?: Date;
};

export type GetRestoreInfoOptions = {
  /** Inspect a specific object version instead of the current one. */
  versionId?: string;
  snapshotVersion?: string;
  config?: TigrisStorageConfig;
};

/**
 * Read an archived object's restore state from its `HEAD` response headers.
 *
 * Resolves to `undefined` when there is no restore information to report — for
 * example, an object in a standard (non-archived) tier, or one that does not
 * exist.
 */
export async function getRestoreInfo(
  path: string,
  options?: GetRestoreInfoOptions
): Promise<TigrisStorageResponse<RestoreInfo | undefined, Error>> {
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const head = new HeadObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    VersionId: options?.versionId,
  });

  if (options?.snapshotVersion) {
    addSnapshotVersionMiddleware(head.middlewareStack, options.snapshotVersion);
  }

  let responseHeaders: Record<string, string> = {};

  // Restore state is conveyed via response headers (x-amz-restore /
  // x-amz-storage-class), which aren't part of the parsed HeadObject output,
  // so capture the raw headers in the deserialize step.
  head.middlewareStack.add(
    (next) => async (args) => {
      const result = await next(args);
      responseHeaders = (result.response as HttpResponse).headers;
      return result;
    },
    {
      step: 'deserialize',
    }
  );

  try {
    return tigrisClient
      .send(head)
      .then(() => {
        return { data: determineRestoreStatus(responseHeaders) };
      })
      .catch((error) => {
        // A missing object simply has no restore information to report.
        if (error?.name === 'NotFound') {
          return { data: undefined };
        }
        return handleError(error as Error);
      });
  } catch (error) {
    return handleError(error as Error);
  }
}

function determineRestoreStatus(
  headers: Record<string, string>
): RestoreInfo | undefined {
  // Response header names arrive lowercased, so match the constants the same way.
  const restoreHeader = headers[TigrisHeaders.RESTORE.toLowerCase()];
  if (restoreHeader) {
    // The object has restore metadata: a restore is ongoing, or has completed
    // and the active copy has an expiry date.
    const isOngoing = restoreHeader.includes('ongoing-request="true"');
    const expiryMatch = restoreHeader.match(/expiry-date="([^"]+)"/);

    return {
      status: isOngoing ? RestoreStatus.InProgress : RestoreStatus.Restored,
      expiresAt: expiryMatch ? new Date(expiryMatch[1]) : undefined,
    };
  }

  // No restore metadata, but the object is archived and can be restored.
  if (headers[TigrisHeaders.STORAGE_CLASS.toLowerCase()] === 'GLACIER') {
    return { status: RestoreStatus.Archived };
  }

  // Object isn't archived (e.g. standard storage) — no restore info.
  return undefined;
}
