import { generateSignatureHeaders, TigrisHeaders } from '@shared/index';
import { config } from '../config';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

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
  body: ReadableStream<Uint8Array>;
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
 * const result = await bundle("my-bucket", ["img_001.jpg", "img_002.jpg"]);
 * if (result.error) throw result.error;
 *
 * // Pipe to file, or process with a tar library
 * const reader = result.data.body.getReader();
 * ```
 *
 * @param bucketName - The bucket containing the objects.
 * @param keys - Array of object keys to include in the bundle (max 5,000).
 * @param options - Optional configuration for compression and error handling.
 */
export async function bundle(
  bucketName: string,
  keys: string[],
  options?: BundleOptions
): Promise<TigrisStorageResponse<BundleResponse, Error>> {
  if (!bucketName) {
    return { error: new Error('Bucket name is required') };
  }

  if (!keys || keys.length === 0) {
    return { error: new Error('At least one key is required') };
  }

  const endpoint =
    options?.config?.endpoint ?? config.endpoint ?? 'https://t3.storage.dev';
  const accessKeyId = options?.config?.accessKeyId ?? config.accessKeyId;
  const secretAccessKey =
    options?.config?.secretAccessKey ?? config.secretAccessKey;
  const sessionToken = options?.config?.sessionToken ?? config.sessionToken;
  const organizationId =
    options?.config?.organizationId ?? config.organizationId;

  const compression = options?.compression ?? 'none';
  const onError = options?.onError ?? 'skip';

  try {
    const url = new URL(`/${bucketName}`, endpoint);
    url.searchParams.set('bundle', '');

    const bodyString = JSON.stringify({ keys });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [TigrisHeaders.BUNDLE_FORMAT]: 'tar',
      [TigrisHeaders.BUNDLE_COMPRESSION]: compression,
      [TigrisHeaders.BUNDLE_ON_ERROR]: onError,
    };

    if (accessKeyId && secretAccessKey && !sessionToken) {
      const signedHeaders = await generateSignatureHeaders(
        'POST',
        url,
        headers,
        bodyString,
        accessKeyId,
        secretAccessKey
      );
      Object.assign(headers, signedHeaders);
    } else {
      if (sessionToken) {
        headers[TigrisHeaders.SESSION_TOKEN] = sessionToken;
      }
      if (organizationId) {
        headers[TigrisHeaders.NAMESPACE] = organizationId;
      }
    }
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: bodyString,
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const text = await response.text();
        errorMessage = text || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }
      return {
        error: new Error(
          `Bundle request failed (HTTP ${response.status}): ${errorMessage}`
        ),
      };
    }

    if (!response.body) {
      return { error: new Error('No body returned from bundle request') };
    }

    return {
      data: {
        body: response.body,
        contentType:
          response.headers.get('content-type') ?? 'application/x-tar',
      },
    };
  } catch (error) {
    return {
      error: new Error(
        `Bundle request failed: ${(error as Error).message ?? 'Unknown error'}`
      ),
    };
  }
}
