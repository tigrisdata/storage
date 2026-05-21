import { config } from '../config';
import { getStats } from '../stats';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListForksOptions = {
  config?: TigrisStorageConfig;
};

export type ForkedBucket = {
  name: string;
  creationDate: Date;
  forkCreatedAt: Date;
  snapshot: string;
  snapshotCreatedAt: Date;
};

export type ListForksResponse = {
  forks: ForkedBucket[];
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

  const forks: ForkedBucket[] = [];
  let paginationToken: string | undefined;

  do {
    const { data, error } = await getStats({
      paginationToken,
      config: options?.config,
    });

    if (error) {
      return { error };
    }

    for (const bucket of data.buckets) {
      const parent = bucket.forkInfo?.parents.find(
        (p) => p.bucketName === sourceBucket
      );
      if (parent) {
        forks.push({
          name: bucket.name,
          creationDate: bucket.creationDate,
          forkCreatedAt: parent.forkCreatedAt,
          snapshot: parent.snapshot,
          snapshotCreatedAt: parent.snapshotCreatedAt,
        });
      }
    }

    paginationToken = data.paginationToken;
  } while (paginationToken);

  return { data: { forks } };
}
