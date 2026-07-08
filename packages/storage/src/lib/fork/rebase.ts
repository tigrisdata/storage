import { handleError, TigrisHeaders } from '@shared/index';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

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
