import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createTigrisClient, TigrisAuthOptions } from './tigris-client';
import { config } from './config';

type GetOptions = {
  auth?: TigrisAuthOptions;
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
};

type GetResponse = string | ReadableStream | File;

export async function get(
  path: string,
  format: 'string',
  options?: GetOptions
): Promise<string>;
export async function get(
  path: string,
  format: 'stream',
  options?: GetOptions
): Promise<ReadableStream>;
export async function get(
  path: string,
  format: 'file',
  options?: GetOptions
): Promise<File>;
export async function get(
  path: string,
  format: 'string' | 'stream' | 'file',
  options?: GetOptions
): Promise<GetResponse> {
  const tigrisClient = createTigrisClient(options?.auth);
  const get = new GetObjectCommand({
    Bucket: options?.auth?.tigrisStorageBucket ?? config.tigrisStorageBucket,
    Key: path,
    ResponseContentType: options?.contentType ?? undefined,
    ResponseContentDisposition:
      options && options.contentDisposition
        ? options.contentDisposition === 'attachment'
          ? `attachment; filename="${path}"`
          : 'inline'
        : undefined,
  });
  return tigrisClient.send(get).then(async (res) => {
    if (!res.Body) {
      throw new Error('No body returned from S3');
    }

    if (format === 'stream') {
      return res.Body.transformToWebStream();
    }
    if (format === 'file') {
      const bytes = await res.Body.transformToByteArray();
      return new File([bytes], path, {
        type: options?.contentType ?? '',
      });
    }
    return await res.Body.transformToString();
  });
}
