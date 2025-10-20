import { HeadBucketCommand } from '@aws-sdk/client-s3';
import type { HttpResponse } from '@aws-sdk/types';
import { createTigrisClient, TigrisHeaders } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type GetBucketInfoOptions = {
  config?: TigrisStorageConfig;
};

export type BucketInfoResponse = {
  isSnapshotEnabled: boolean;
  hasForks: boolean;
  sourceBucketName?: string;
  sourceBucketSnapshot?: string;
};

export async function getBucketInfo(
  bucketName: string,
  options?: GetBucketInfoOptions
): Promise<TigrisStorageResponse<BucketInfoResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);
  if (error || !tigrisClient) {
    return { error };
  }

  const command = new HeadBucketCommand({ Bucket: bucketName });

  let headers: Record<string, string> = {};

  command.middlewareStack.add(
    (next) => async (args) => {
      const result = await next(args);
      headers = (result.response as HttpResponse).headers;

      return result;
    },
    { step: 'deserialize' }
  );

  try {
    return tigrisClient
      .send(command)
      .then(() => {
        return {
          data: {
            isSnapshotEnabled:
              headers[TigrisHeaders.SNAPSHOT_ENABLED.toLowerCase()] !==
                undefined &&
              headers[TigrisHeaders.SNAPSHOT_ENABLED.toLowerCase()] === 'true',
            hasForks:
              headers[TigrisHeaders.HAS_FORKS.toLowerCase()] !== undefined &&
              headers[TigrisHeaders.HAS_FORKS.toLowerCase()] === 'true',
            ...(headers[TigrisHeaders.FORK_SOURCE_BUCKET.toLowerCase()] !==
            undefined
              ? {
                  sourceBucketName:
                    headers[TigrisHeaders.FORK_SOURCE_BUCKET.toLowerCase()],
                }
              : {}),
            ...(headers[
              TigrisHeaders.FORK_SOURCE_BUCKET_SNAPSHOT.toLowerCase()
            ] !== undefined
              ? {
                  sourceBucketSnapshot:
                    headers[
                      TigrisHeaders.FORK_SOURCE_BUCKET_SNAPSHOT.toLowerCase()
                    ],
                }
              : {}),
          },
        };
      })
      .catch((error) => {
        return {
          error: new Error(`Unable to get bucket info ${error.message}`),
        };
      });
  } catch {
    return { error: new Error('Unable to get bucket info') };
  }
}
