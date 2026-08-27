import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { getConfig, missingConfigError } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import {
  addSnapshotVersionMiddleware,
  addSoftDeleteMiddleware,
} from './middleware';

export type ListOptions = {
  delimiter?: string;
  prefix?: string;
  limit?: number;
  paginationToken?: string;
  snapshotVersion?: string;
  source?: 'tigris' | 'shadow';
  /**
   * List the bucket's soft-deleted objects instead of its live ones. This is a
   * separate view, not an addition: the response contains only recoverable
   * deleted objects, and live objects are left out entirely.
   *
   * Requires soft delete to be enabled on the bucket
   * (`updateBucket(name, { softDelete })`). On a snapshot bucket, note that a
   * plain delete records a delete marker rather than soft-deleting, so those
   * objects appear in `listVersions()` and not here; deleting one specific
   * version does soft-delete that version. To act on an entry here, look up
   * its recoverable versions with `listVersions({ deleted: true })`, then pass
   * a `versionId` to `restoreDeletedObject` or `purgeDeletedObject`.
   */
  deleted?: boolean;
  config?: TigrisStorageConfig;
};

export type ListItem = {
  id: string;
  name: string;
  size: number;
  lastModified: Date;
  etag: string;
};

export type ListResponse = {
  items: ListItem[];
  commonPrefixes: string[];
  paginationToken: string | undefined;
  hasMore: boolean;
};

export async function list(
  options?: ListOptions
): Promise<TigrisStorageResponse<ListResponse, Error>> {
  const config = getConfig();
  if (!options?.config?.bucket && !config.bucket) {
    return missingConfigError('bucket');
  }

  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const list = new ListObjectsV2Command({
    Bucket: options?.config?.bucket ?? config.bucket,
    Prefix: options?.prefix,
    Delimiter: options?.delimiter,
    MaxKeys: options?.limit,
    ContinuationToken: options?.paginationToken,
  });

  if (options?.snapshotVersion) {
    addSnapshotVersionMiddleware(list.middlewareStack, options.snapshotVersion);
  }

  if (options?.deleted) {
    addSoftDeleteMiddleware(list.middlewareStack);
  }

  if (options?.source) {
    const source = options.source;
    list.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers[TigrisHeaders.BUCKET_LIST_SOURCE] = source;
        return next(args);
      },
      { name: 'X-Tigris-List-Source-Middleware', step: 'build', override: true }
    );
  }

  try {
    return tigrisClient
      .send(list)
      .then((res) => {
        return {
          data: {
            items:
              res.Contents?.map((item) => ({
                id: item.Key ?? '',
                name: item.Key ?? '',
                size: item.Size ?? 0,
                lastModified: item.LastModified ?? new Date(),
                etag: item.ETag ?? '',
              })) ?? [],
            commonPrefixes:
              res.CommonPrefixes?.map((p) => p.Prefix ?? '').filter(Boolean) ??
              [],
            paginationToken: res.NextContinuationToken,
            hasMore: res.IsTruncated ?? false,
          },
        };
      })
      .catch((error) => {
        return {
          error: new Error(`Unable to list objects ${error.message}`),
        };
      });
  } catch {
    return { error: new Error('Unable to list objects') };
  }
}
