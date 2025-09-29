import { CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListBucketSnapshotsOptions = {
  config?: TigrisStorageConfig;
};

export type ListBucketSnapshotsResponse = Array<{
  snapshotName: string | undefined;
  creationDate: Date | undefined;
}>;

export async function listBucketSnapshots(
  options?: ListBucketSnapshotsOptions
): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const bucketName = options?.config?.bucket ?? config.bucket;

  const command = new ListBucketsCommand({});
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers['X-Tigris-Snapshot'] = bucketName!;
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
  description?: string;
  config?: TigrisStorageConfig;
};

export async function createBucketSnapshot(
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<void, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const sourceBucket = options?.config?.bucket ?? config.bucket;

  const command = new CreateBucketCommand({ Bucket: sourceBucket });
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers['X-Tigris-Snapshot'] =
        `true; desc=${options?.description}`;
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
