import { TigrisHeaders } from '@shared/index';
import { config, missingConfigError } from '../config';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { createStorageClient } from '../http-client';

export type BundleOptions = {
  config?: TigrisStorageConfig;
  /**
   * Compression algorithm for the response.
   * - `"none"` (default): No compression. Best for already-compressed data (JPEG, PNG).
   * - `"gzip"`: Gzip compression.
   * - `"zstd"`: Zstd compression. Best ratio + speed for large bundles.
   */
  compression?: 'none' | 'gzip' | 'zstd';
  /**
   * Error handling mode for missing objects.
   * - `"skip"` (default): Omit missing objects and append `__bundle_errors.json` to the tar.
   * - `"fail"`: Return an error before streaming if any object is missing.
   */
  onError?: 'skip' | 'fail';
};

export type BundleResponse = {
  /** The streaming tar archive body. Caller is responsible for consuming and closing. */
  body: ReadableStream;
  /** The response Content-Type (e.g. "application/x-tar", "application/gzip"). */
  contentType: string;
};

/**
 * Fetch multiple objects from a bucket as a streaming tar archive in a single request.
 *
 * This is a Tigris extension to the S3 API, designed for ML training workloads
 * that need to fetch thousands of objects per batch without per-object HTTP overhead.
 *
 * @example
 * ```ts
 * const result = await bundle(["img_001.jpg", "img_002.jpg"], {
 *   config: { bucket: "my-bucket" },
 * });
 * if (result.error) throw result.error;
 *
 * const reader = result.data.body.getReader();
 * ```
 *
 * @param keys - Array of object keys to include in the bundle (max 5,000).
 * @param options - Optional configuration including bucket, compression, and error handling.
 */
export async function bundle(
  keys: string[],
  options?: BundleOptions
): Promise<TigrisStorageResponse<BundleResponse, Error>> {
  const bucket = options?.config?.bucket ?? config.bucket;

  if (!bucket) {
    return missingConfigError('bucket');
  }

  if (!keys || keys.length === 0) {
    return { error: new Error('At least one key is required') };
  }

  const { data: storageHttpClient, error: storageHttpClientError } =
    createStorageClient(options?.config);

  if (storageHttpClientError) {
    return { error: storageHttpClientError };
  }

  const compression = options?.compression ?? 'none';
  const onError = options?.onError ?? 'skip';

  const response = await storageHttpClient.request<unknown, ReadableStream>({
    method: 'POST',
    path: `/${bucket}`,
    query: { bundle: '' },
    body: { keys },
    stream: true,
    headers: {
      'Content-Type': 'application/json',
      [TigrisHeaders.BUNDLE_FORMAT]: 'tar',
      [TigrisHeaders.BUNDLE_COMPRESSION]: compression,
      [TigrisHeaders.BUNDLE_ON_ERROR]: onError,
    },
  });

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: {
      body: response.data,
      contentType: response.headers.get('content-type') ?? 'application/x-tar',
    },
  };
}
