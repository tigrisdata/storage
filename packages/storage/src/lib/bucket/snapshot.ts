import { CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import type { HttpRequest, HttpResponse } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type ListBucketSnapshotsOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
  paginationToken?: string;
  limit?: number;
};

export type BucketSnapshot = {
  name?: string | undefined;
  version: string | undefined;
  creationDate: Date | undefined;
};

export type ListBucketSnapshotsResponse = {
  snapshots: BucketSnapshot[];
  paginationToken?: string;
};

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

  const command = new ListBucketsCommand({
    ContinuationToken: options?.paginationToken,
    MaxBuckets: options?.limit,
  });
  command.middlewareStack.add(
    (next) => async (args) => {
      (args.request as HttpRequest).headers[TigrisHeaders.SNAPSHOT] =
        sourceBucket;
      return next(args);
    },
    { step: 'build' }
  );

  try {
    return tigrisClient
      .send(command)
      .then((res) => {
        return {
          data: {
            snapshots:
              res.Buckets?.map((bucket) => ({
                name: bucket.Name?.split('; name=')[1],
                version: bucket.Name?.split(';')[0],
                creationDate: bucket.CreationDate,
              })) ?? [],
            paginationToken: res.ContinuationToken,
          },
        };
      })
      .catch((error) => {
        return {
          error: new Error(`Unable to list bucket snapshots ${error.message}`),
        };
      });
  } catch {
    return { error: new Error('Unable to list bucket snapshots') };
  }
}

export type CreateBucketSnapshotOptions = {
  name?: string;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type CreateBucketSnapshotResponse = {
  snapshotVersion: string;
};

export async function createBucketSnapshot(
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>>;
export async function createBucketSnapshot(
  sourceBucketName?: string,
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>>;
export async function createBucketSnapshot(
  sourceBucketName?: string | CreateBucketSnapshotOptions,
  options?: CreateBucketSnapshotOptions
): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>> {
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
      if (options?.name) {
        header = `${header}; name=${options.name}`;
      }
      (args.request as HttpRequest).headers[TigrisHeaders.SNAPSHOT] = header;
      return next(args);
    },
    { step: 'build' }
  );

  let responseHeaders: Record<string, string> = {};

  command.middlewareStack.add(
    (next) => async (args) => {
      const result = await next(args);
      responseHeaders = (result.response as HttpResponse).headers;

      return result;
    },
    { step: 'build' }
  );

  try {
    return tigrisClient
      .send(command)
      .then(() => {
        return {
          data: {
            snapshotVersion:
              responseHeaders[TigrisHeaders.SNAPSHOT_VERSION.toLowerCase()] ??
              '',
          },
        };
      })
      .catch((error) => {
        return {
          error: new Error(`Unable to create bucket snapshot ${error.message}`),
        };
      });
  } catch {
    return { error: new Error('Unable to create bucket snapshot') };
  }
}
