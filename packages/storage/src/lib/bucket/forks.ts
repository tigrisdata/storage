import { handleError, TigrisHeaders } from '@shared/index';
import { config } from '../config';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { listForksLegacy } from './_fork';
import { fetchBucketListing } from './listing';
import type { Bucket } from './types';

export type ListForksOptions = {
  config?: TigrisStorageConfig;
  paginationToken?: string;
  limit?: number;
};

export type BucketFork = Bucket & {
  /**
   * @deprecated Use `@forkInfo.parents[0].forkCreatedAt` instead
   */
  forkCreatedAt: Date;
  /**
   * @deprecated Use `@forkInfo.parents[0].snapshot` instead
   */
  snapshot: string;
  /**
   * @deprecated Use `@forkInfo.parents[0].snapshotCreatedAt` instead
   */
  snapshotCreatedAt: Date;
};

/**
 * @deprecated Use `BucketFork` instead
 */
export type ForkedBucket = BucketFork;

export type ListForksResponse = {
  forks: BucketFork[];
  paginationToken?: string;
};

export async function listForks(
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
export async function listForks(
  sourceBucketName?: string,
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>>;
export async function listForks(
  sourceBucketName?: string | ListForksOptions,
  options?: ListForksOptions
): Promise<TigrisStorageResponse<ListForksResponse, Error>> {
  if (typeof sourceBucketName === 'object') {
    options = sourceBucketName;
    sourceBucketName = undefined;
  }

  const sourceBucket = sourceBucketName ?? config.bucket;

  if (!sourceBucket) {
    return { error: new Error('Source bucket name is required') };
  }

  const { data, error } = await fetchBucketListing({
    flags: {
      forksOf: sourceBucket,
    },
    paginationToken: options?.paginationToken,
    limit: options?.limit,
    config: options?.config,
  });

  if (error) {
    return { error: new Error(`Unable to list buckets ${error.message}`) };
  }

  if (
    data.buckets.length > 0 &&
    data.buckets.every((bucket) => bucket.forkInfo === undefined)
  ) {
    return listForksLegacy(sourceBucket, options);
  }

  return {
    data: {
      forks: data.buckets.map((bucket) => ({
        ...bucket,
        forkCreatedAt: bucket.forkInfo?.parents[0]?.forkCreatedAt ?? new Date(),
        snapshot: bucket.forkInfo?.parents[0]?.snapshot ?? '',
        snapshotCreatedAt:
          bucket.forkInfo?.parents[0]?.snapshotCreatedAt ?? new Date(),
      })),
      paginationToken: data.paginationToken,
    },
  };
}

export type MergeForkOptions = {
  /**
   * Merge from a specific snapshot of the fork (the merge source) rather than
   * its current state. Maps to `X-Tigris-Merge-Source-Bucket-Snapshot`.
   */
  forkSnapshot?: string;
  config?: TigrisStorageConfig;
};

export type MergeForkResponse = {
  snapshotVersion: string;
};

export async function mergeFork(
  forkName: string,
  sourceBucketName: string,
  options?: MergeForkOptions
): Promise<TigrisStorageResponse<MergeForkResponse, Error>> {
  if (!forkName || !sourceBucketName) {
    return {
      error: new Error('Fork name and source bucket name are required'),
    };
  }

  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  try {
    // The gateway merges a fork back into its parent: the request targets the
    // parent (`sourceBucketName`) and names the fork as the merge source. The
    // merge source must be a direct fork of the target, otherwise the gateway
    // returns `400 InvalidArgument`.
    const response = await storageHttpClient.request<unknown, unknown>({
      method: 'PUT',
      path: `/${sourceBucketName}`,
      headers: {
        [TigrisHeaders.FORK_MERGE_SOURCE_BUCKET]: forkName,
        ...(options?.forkSnapshot
          ? {
              [TigrisHeaders.FORK_MERGE_SOURCE_BUCKET_SNAPSHOT]:
                options?.forkSnapshot,
            }
          : {}),
      },
    });

    if (response.error) {
      return { error: response.error };
    }

    return {
      data: {
        snapshotVersion:
          response.headers.get(TigrisHeaders.SNAPSHOT_VERSION) ?? '',
      },
    };
  } catch (error) {
    return handleError(error as Error);
  }
}

export type RebaseForkOptions = {
  config?: TigrisStorageConfig;
};

export type RebaseForkResponse = {
  snapshotVersion: string;
};

export async function rebaseFork(
  forkName: string,
  options?: RebaseForkOptions
): Promise<TigrisStorageResponse<RebaseForkResponse, Error>> {
  if (!forkName) {
    return {
      error: new Error('Fork name is required'),
    };
  }

  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  try {
    const response = await storageHttpClient.request<unknown, unknown>({
      method: 'PUT',
      path: `/${forkName}`,
      headers: {
        [TigrisHeaders.REBASE]: 'true',
      },
    });

    if (response.error) {
      return { error: response.error };
    }

    return {
      data: {
        snapshotVersion:
          response.headers.get(TigrisHeaders.SNAPSHOT_VERSION) ?? '',
      },
    };
  } catch (error) {
    return handleError(error as Error);
  }
}
