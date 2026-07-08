import { handleError, TigrisHeaders } from '@shared/index';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type MergeForkOptions = {
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
