import { ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { handleError } from '@shared/utils';
import { config, missingConfigError } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListVersionsOptions = {
  delimiter?: string;
  prefix?: string;
  limit?: number;
  keyMarker?: string;
  /**
   * Pagination position within a key's versions. S3 ignores this when
   * `keyMarker` is not also set, so passing it alone returns an error.
   */
  versionIdMarker?: string;
  config?: TigrisStorageConfig;
};

export type ObjectVersion = {
  name: string;
  versionId: string | undefined;
  isLatest: boolean;
  size: number;
  lastModified: Date;
};

export type DeleteMarker = {
  name: string;
  versionId: string | undefined;
  isLatest: boolean;
  lastModified: Date;
};

export type ListVersionsResponse = {
  versions: ObjectVersion[];
  deleteMarkers: DeleteMarker[];
  commonPrefixes: string[];
  nextKeyMarker: string | undefined;
  nextVersionIdMarker: string | undefined;
  hasMore: boolean;
};

export async function listVersions(
  options?: ListVersionsOptions
): Promise<TigrisStorageResponse<ListVersionsResponse, Error>> {
  if (!options?.config?.bucket && !config.bucket) {
    return missingConfigError('bucket');
  }

  if (options?.versionIdMarker && !options?.keyMarker) {
    return {
      error: new Error('versionIdMarker requires keyMarker to also be set'),
    };
  }

  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const command = new ListObjectVersionsCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Prefix: options?.prefix,
    Delimiter: options?.delimiter,
    MaxKeys: options?.limit,
    KeyMarker: options?.keyMarker,
    VersionIdMarker: options?.versionIdMarker,
  });

  try {
    return tigrisClient
      .send(command)
      .then((res) => ({
        data: {
          versions:
            res.Versions?.map((v) => ({
              name: v.Key ?? '',
              versionId: v.VersionId,
              isLatest: v.IsLatest ?? false,
              size: v.Size ?? 0,
              lastModified: v.LastModified ?? new Date(),
            })) ?? [],
          deleteMarkers:
            res.DeleteMarkers?.map((m) => ({
              name: m.Key ?? '',
              versionId: m.VersionId,
              isLatest: m.IsLatest ?? false,
              lastModified: m.LastModified ?? new Date(),
            })) ?? [],
          commonPrefixes:
            res.CommonPrefixes?.map((p) => p.Prefix ?? '').filter(Boolean) ??
            [],
          nextKeyMarker: res.NextKeyMarker,
          nextVersionIdMarker: res.NextVersionIdMarker,
          hasMore: res.IsTruncated ?? false,
        },
      }))
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}
