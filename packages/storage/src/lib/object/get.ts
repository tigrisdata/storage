import { GetObjectCommand } from '@aws-sdk/client-s3';
import { handleError } from '@shared/index';
import { getConfig } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { addSnapshotVersionMiddleware } from './middleware';

export type GetOptions = {
  config?: TigrisStorageConfig;
  contentDisposition?: 'attachment' | 'inline';
  contentType?: string;
  encoding?: string;
  /**
   * When true, `get` returns `{ body, metadata }` instead of the bare
   * body, surfacing the object's etag, content metadata, user metadata,
   * and (when `range` is used) `Content-Range` — all read from the same
   * S3 response, no extra round-trip.
   */
  includeMetadata?: boolean;
  /**
   * Byte range to read. Both bounds are inclusive and 0-based, matching
   * the HTTP `Range: bytes=…` semantics. Omit `end` to read from `start`
   * to the end of the object. A range that falls entirely outside the
   * object returns an error (HTTP 416). The returned body is the partial
   * content only.
   */
  range?: { start: number; end?: number };
  snapshotVersion?: string;
  versionId?: string;
};

export type GetMetadata = {
  contentDisposition: string;
  contentType: string;
  etag: string;
  modified: Date;
  /**
   * Number of bytes in this response body. For a full read this equals
   * the object size; for a range read this is the length of the partial
   * content. See `totalSize` for the full object size on range reads.
   */
  size: number;
  /**
   * Full object size in bytes. Always set for full reads (same as `size`);
   * for range reads, parsed from `Content-Range` (`bytes start-end/total`).
   * `undefined` if the gateway omits or malforms the header.
   */
  totalSize?: number;
  /** User metadata baked into the object via `x-amz-meta-*`. */
  userMetadata: Record<string, string>;
  /** Populated when `range` was used; e.g. `"bytes 0-99/1024"`. */
  contentRange?: string;
};

/**
 * Parse the total-size suffix out of a `Content-Range: bytes start-end/total`
 * value. Returns `undefined` when the header is missing or malformed (S3
 * may return `*` for unknown length).
 */
function parseTotalSizeFromContentRange(
  contentRange: string | undefined
): number | undefined {
  if (!contentRange) return undefined;
  const match = /\/(\d+)\s*$/.exec(contentRange);
  if (!match) return undefined;
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : undefined;
}

export type GetResponseWithMetadata<T> = {
  body: T;
  metadata: GetMetadata;
};

function formatRange(range: NonNullable<GetOptions['range']>): string | Error {
  const { start, end } = range;
  if (!Number.isInteger(start) || start < 0) {
    return new Error('range.start must be a non-negative integer');
  }
  if (end !== undefined) {
    if (!Number.isInteger(end) || end < start) {
      return new Error(
        'range.end must be an integer greater than or equal to range.start'
      );
    }
    return `bytes=${start}-${end}`;
  }
  return `bytes=${start}-`;
}

export type GetResponse = string | File | ReadableStream;

// Wrapped overloads first so TS resolves the literal `includeMetadata: true`
// before falling through to the bare branch.
export async function get(
  path: string,
  format: 'string',
  options: GetOptions & { includeMetadata: true }
): Promise<TigrisStorageResponse<GetResponseWithMetadata<string>, Error>>;
export async function get(
  path: string,
  format: 'file',
  options: GetOptions & { includeMetadata: true }
): Promise<TigrisStorageResponse<GetResponseWithMetadata<File>, Error>>;
export async function get(
  path: string,
  format: 'stream',
  options: GetOptions & { includeMetadata: true }
): Promise<
  TigrisStorageResponse<GetResponseWithMetadata<ReadableStream>, Error>
>;
// Bare overloads accept any GetOptions — including ones where the
// `includeMetadata` flag is statically widened to `boolean | undefined`.
export async function get(
  path: string,
  format: 'string',
  options?: GetOptions
): Promise<TigrisStorageResponse<string, Error>>;
export async function get(
  path: string,
  format: 'file',
  options?: GetOptions
): Promise<TigrisStorageResponse<File, Error>>;
export async function get(
  path: string,
  format: 'stream',
  options?: GetOptions
): Promise<TigrisStorageResponse<ReadableStream, Error>>;
export async function get(
  path: string,
  format: 'string' | 'file' | 'stream',
  options?: GetOptions
): Promise<
  TigrisStorageResponse<
    GetResponse | GetResponseWithMetadata<GetResponse>,
    Error
  >
> {
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  let rangeHeader: string | undefined;
  if (options?.range) {
    const formatted = formatRange(options.range);
    if (formatted instanceof Error) {
      return { error: formatted };
    }
    rangeHeader = formatted;
  }

  const get = new GetObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    VersionId: options?.versionId,
    Range: rangeHeader,
    ResponseContentType: options?.contentType ?? undefined,
    ResponseContentDisposition: options?.contentDisposition
      ? options.contentDisposition === 'attachment'
        ? `attachment; filename="${path}"`
        : 'inline'
      : undefined,
  });

  if (options?.snapshotVersion) {
    addSnapshotVersionMiddleware(get.middlewareStack, options.snapshotVersion);
  }

  try {
    return tigrisClient
      .send(get)
      .then(async (res) => {
        if (!res.Body) {
          return {
            error: new Error('No body returned from Tigris Storage'),
          };
        }

        let body: GetResponse;
        if (format === 'stream') {
          body = res.Body.transformToWebStream();
        } else if (format === 'file') {
          const bytes = await res.Body.transformToByteArray();
          body = new File([bytes as BlobPart], path, {
            type: res.ContentType ?? options?.contentType ?? '',
          });
        } else {
          body = await res.Body.transformToString(options?.encoding);
        }

        if (!options?.includeMetadata) {
          return { data: body };
        }

        const size = res.ContentLength ?? 0;
        const totalSize = res.ContentRange
          ? parseTotalSizeFromContentRange(res.ContentRange)
          : size;
        return {
          data: {
            body,
            metadata: {
              contentDisposition: res.ContentDisposition ?? '',
              contentType: res.ContentType ?? '',
              etag: res.ETag ?? '',
              modified: res.LastModified ?? new Date(),
              size,
              totalSize,
              userMetadata: res.Metadata ?? {},
              contentRange: res.ContentRange,
            },
          },
        };
      })
      .catch(handleError);
  } catch (error) {
    return handleError(error as Error);
  }
}
