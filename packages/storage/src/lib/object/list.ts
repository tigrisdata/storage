import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { config, missingConfigError } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListOptions = {
  limit?: number;
  paginationToken?: string;
  snapshotVersion?: string;
  config?: TigrisStorageConfig;
};

export type ListItem = {
  id: string;
  name: string;
  size: number;
  lastModified: Date;
};

export type ListResponse = {
  items: ListItem[];
  paginationToken: string | undefined;
  hasMore: boolean;
};

export async function list(
  options?: ListOptions
): Promise<TigrisStorageResponse<ListResponse, Error>> {
  if (!options?.config?.bucket && !config.bucket) {
    return missingConfigError('bucket');
  }

  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const list = new ListObjectsV2Command({
    Bucket: options?.config?.bucket ?? config.bucket,
    MaxKeys: options?.limit,
    ContinuationToken: options?.paginationToken,
  });

  if (options?.snapshotVersion) {
    list.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers['X-Tigris-Snapshot-Version'] = `${options.snapshotVersion}`;
        const result = await next(args);
        return result;
      },
      {
        name: 'X-Tigris-Snapshot-Middleware',
        step: 'build',
        override: true,
      }
    );
  }

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
            })) ?? [],
          paginationToken: res.NextContinuationToken,
          hasMore: res.IsTruncated ?? false,
        },
      };
    })
    .catch((error) => {
      return {
        error,
      };
    });
}
