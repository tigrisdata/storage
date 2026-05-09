import { TigrisHeaders } from '@shared/headers';
import { handleError } from '@shared/utils';
import { config, missingConfigError } from '../config';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type CopyOptions = {
  config?: TigrisStorageConfig;
  /** Source bucket. Defaults to `config.bucket`. */
  srcBucket?: string;
  /** Destination bucket. Defaults to `srcBucket` (same-bucket copy). */
  destBucket?: string;
};

export type CopyResponse = {
  src: string;
  dest: string;
};

export async function copy(
  src: string,
  dest: string,
  options?: CopyOptions
): Promise<TigrisStorageResponse<CopyResponse, Error>> {
  return copyOrMove(src, dest, false, options);
}

export async function copyOrMove(
  src: string,
  dest: string,
  rename: boolean,
  options?: CopyOptions
): Promise<TigrisStorageResponse<CopyResponse, Error>> {
  if (!src || !dest) {
    return { error: new Error('src and dest are required') };
  }

  const srcBucket =
    options?.srcBucket ?? options?.config?.bucket ?? config.bucket;

  if (!srcBucket) {
    return missingConfigError('bucket');
  }

  const destBucket = options?.destBucket ?? srcBucket;

  if (srcBucket === destBucket && src === dest) {
    return { error: new Error('src and dest must differ') };
  }

  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  const headers: Record<string, string> = {
    [TigrisHeaders.COPY_SOURCE]: `${srcBucket}/${encodeURIComponent(src)}`,
  };

  if (rename) {
    headers[TigrisHeaders.RENAME] = 'true';
  }

  try {
    const response = await storageHttpClient.request({
      method: 'PUT',
      path: `/${destBucket}/${encodeURIComponent(dest)}?x-id=CopyObject`,
      headers,
    });

    if (response.error) {
      return { error: response.error };
    }
  } catch (error) {
    return handleError(error as Error);
  }

  return {
    data: {
      src: `${srcBucket}/${src}`,
      dest: `${destBucket}/${dest}`,
    },
  };
}
