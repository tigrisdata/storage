import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';
import { config } from './config';

type GetOptions = {
  config?: TigrisStorageConfig;
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
};

type GetResponse = string | ReadableStream | File;

export async function get(
  path: string,
  format: 'string',
  options?: GetOptions
): Promise<TigrisStorageResponse<string, Error>>;
export async function get(
  path: string,
  format: 'stream',
  options?: GetOptions
): Promise<TigrisStorageResponse<ReadableStream, Error>>;
export async function get(
  path: string,
  format: 'file',
  options?: GetOptions
): Promise<TigrisStorageResponse<File, Error>>;
export async function get(
  path: string,
  format: 'string' | 'stream' | 'file',
  options?: GetOptions
): Promise<TigrisStorageResponse<GetResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
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

  try {
    return tigrisClient.send(get).then(async (res) => {
      if (!res.Body) {
        return {
          error: new Error('No body returned from S3'),
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
          data: new File([bytes], path, {
            type: options?.contentType ?? '',
          }),
        };
      }
      return {
        data: await res.Body.transformToString(),
      };
    });
  } catch (error) {
    return {
      error:
        (error as { Code?: string }).Code === 'AccessDenied'
          ? new Error(
              `Access denied while downloading from Tigris Storage. Please check your credentials.`
            )
          : new Error(`Unexpected error while downloading from Tigris Storage`),
    };
  }
}
