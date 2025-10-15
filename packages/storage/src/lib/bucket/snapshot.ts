import { CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListBucketSnapshotsOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type ListBucketSnapshotsResponse = Array<{
  /*
    @deprecated Use name and version instead, will be removed in the next major version
  */
  name?: string | undefined;
  version: string | undefined;
  snapshotName: string | undefined;
  creationDate: Date | undefined;
}>;

export async function listBucketSnapshots(
  options?: ListBucketSnapshotsOptions
): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>>;
export async function listBucketSnapshots(
  sourceBucketName?: string,
  options?: ListBucketSnapshotsOptions
): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>>;
export async function listBucketSnapshots(
  sourceBucketName?: string | ListBucketSnapshotsOptions,
  options?: ListBucketSnapshotsOptions
): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>> {
  if (typeof sourceBucketName === 'object') {
    options = sourceBucketName;
    sourceBucketName = undefined;
  }

  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  const sourceBucket = sourceBucketName ?? config.bucket;

  if (!sourceBucket) {
    return { error: new Error('Source bucket name is required') };
  }

  const command = new ListBucketsCommand({});
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers['X-Tigris-Snapshot'] = sourceBucket;
      return next(args);
    },
    { step: 'build' }
  );

  return tigrisClient
    .send(command)
    .then((res) => {
      return {
        data:
          res.Buckets?.map((bucket) => ({
            name: bucket.Name?.split('; name=')[1],
            version: bucket.Name?.split(';')[0],
            snapshotName: bucket.Name,
            creationDate: bucket.CreationDate,
          })) ?? [],
      };
    })
    .catch((error) => {
      return { error: new Error(`Unable to list bucket snapshots ${error}`) };
    });
}

export type CreateBucketSnapshotOptions = {
  name?: string;
  /**
   * @deprecated Use name instead, will be removed in the next major version
   */
  description?: string;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function createBucketSnapshot(
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<void, Error>>;
export async function createBucketSnapshot(
  sourceBucketName?: string,
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<void, Error>>;
export async function createBucketSnapshot(
  sourceBucketName?: string | CreateBucketSnapshotOptions,
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<void, Error>> {
  if (typeof sourceBucketName === 'object') {
    options = sourceBucketName;
    sourceBucketName = undefined;
  }

  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  const sourceBucket = sourceBucketName ?? config.bucket;

  if (!sourceBucket) {
    return { error: new Error('Source bucket name is required') };
  }

  const command = new CreateBucketCommand({ Bucket: sourceBucket });
  command.middlewareStack.add(
    (next) => async (args) => {
      let header = 'true';
      if (options?.name ?? options?.description) {
        header = `${header}; name=${options?.name ?? options?.description}`;
      }
      (args.request as HttpRequest).headers['X-Tigris-Snapshot'] = header;
      return next(args);
    },
    { step: 'build' }
  );

  return tigrisClient
    .send(command)
    .then(() => {
      return { data: undefined };
    })
    .catch((error) => {
      return { error: new Error(`Unable to create bucket snapshot ${error}`) };
    });
}
