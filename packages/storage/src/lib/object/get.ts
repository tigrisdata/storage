import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { config } from '../config';
import { createTigrisClient, TigrisHeaders } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type GetOptions = {
  config?: TigrisStorageConfig;
  contentDisposition?: 'attachment' | 'inline';
  contentType?: string;
  encoding?: string;
  snapshotVersion?: string;
};

export type GetResponse = string | File | ReadableStream;

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
): Promise<TigrisStorageResponse<GetResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const get = new GetObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    ResponseContentType: options?.contentType ?? undefined,
    ResponseContentDisposition:
      options && options.contentDisposition
        ? options.contentDisposition === 'attachment'
          ? `attachment; filename="${path}"`
          : 'inline'
        : undefined,
  });

  if (options?.snapshotVersion) {
    get.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers[TigrisHeaders.SNAPSHOT_VERSION] =
          `${options.snapshotVersion}`;
        const result = await next(args);
        return result;
      },
      {
        name: 'X-Tigris-Snapshot-Middleware',
        step: 'build',
        override: true,
      }
    );
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

        if (format === 'stream') {
          return {
            data: res.Body.transformToWebStream(),
          };
        }

        if (format === 'file') {
          const bytes = await res.Body.transformToByteArray();
          return {
            data: new File([bytes as BlobPart], path, {
              type: res.ContentType ?? options?.contentType ?? '',
            }),
          };
        }

        return {
          data: await res.Body.transformToString(options?.encoding),
        };
      })
      .catch(handleError);
  } catch (error) {
    return handleError(error);
  }
}

const handleError = (error: unknown) => {
  let errorMessage = 'Unexpected error while downloading from Tigris Storage';

  if ((error as { Code?: string }).Code === 'AccessDenied') {
    errorMessage =
      'Access denied while downloading from Tigris Storage. Please check your credentials.';
  }
  if ((error as { Code?: string }).Code === 'NoSuchKey') {
    errorMessage = 'File not found in Tigris Storage';
  }

  return {
    error: new Error(errorMessage),
  };
};
