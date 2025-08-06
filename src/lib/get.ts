import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../utils/s3-client';

type GetOptions = {
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
};

type GetResponse = string | ReadableStream | Blob;

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
  format: 'blob',
  options?: GetOptions
): Promise<File>;
export async function get(
  path: string,
  format: 'string' | 'stream' | 'blob',
  options?: GetOptions
): Promise<GetResponse> {
  const s3Client = createS3Client();
  const get = new GetObjectCommand({
    Bucket: process.env.TIGRIS_STORAGE_BUCKET,
    Key: path,
    ResponseContentType: options?.contentType ?? undefined,
    ResponseContentDisposition:
      options && options.contentDisposition
        ? options.contentDisposition === 'attachment'
          ? `attachment; filename="${path}"`
          : 'inline'
        : undefined,
  });
  return s3Client.send(get).then(async (res) => {
    if (!res.Body) {
      throw new Error('No body returned from S3');
    }

    if (format === 'stream') {
      return res.Body.transformToWebStream();
    }
    if (format === 'blob') {
      const bytes = await res.Body.transformToByteArray();
      return new File([bytes], path, {
        type: options?.contentType ?? '',
      });
    }
    return await res.Body.transformToString();
  });
}
