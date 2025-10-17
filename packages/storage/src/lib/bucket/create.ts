import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { createTigrisClient, TigrisHeaders } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type CreateBucketOptions = {
  enableSnapshot?: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type CreateBucketResponse = {
  isSnapshotEnabled: boolean;
  hasForks: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
};

export async function createBucket(
  bucketName: string,
  options?: CreateBucketOptions
): Promise<TigrisStorageResponse<CreateBucketResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  const command = new CreateBucketCommand({
    Bucket: bucketName,
  });

  if (options?.enableSnapshot) {
    command.middlewareStack.add(
      (next) => async (args) => {
        (args.request as HttpRequest).headers[TigrisHeaders.SNAPSHOT_ENABLED] =
          'true';
        return next(args);
      },
      { step: 'build' }
    );
  }

  if (options?.sourceBucketName && options.sourceBucketName !== '') {
    const sourceBucketName = options.sourceBucketName;
    command.middlewareStack.add(
      (next) => async (args) => {
        (args.request as HttpRequest).headers[
          TigrisHeaders.FORK_SOURCE_BUCKET
        ] = sourceBucketName;

        if (
          options?.sourceBucketSnapshot &&
          options.sourceBucketSnapshot !== ''
        ) {
          (args.request as HttpRequest).headers[
            TigrisHeaders.FORK_SOURCE_BUCKET_SNAPSHOT
          ] = options.sourceBucketSnapshot;
        }

        return next(args);
      },
      { step: 'build' }
    );
  }

  try {
    return tigrisClient
      .send(command)
      .then(() => {
        return {
          data: {
            isSnapshotEnabled: !!options?.enableSnapshot,
            hasForks: false,
            ...(options?.sourceBucketName
              ? { sourceBucketName: options?.sourceBucketName }
              : {}),
            ...(options?.sourceBucketSnapshot
              ? { sourceBucketSnapshot: options?.sourceBucketSnapshot }
              : {}),
          },
        };
      })
      .catch((error) => {
        return { error: new Error(`Unable to create bucket ${error.message}`) };
      });
  } catch {
    return { error: new Error('Unable to create bucket') };
  }
}
