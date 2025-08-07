import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createTigrisClient, TigrisAuthOptions } from './tigris-client';
import { config } from './config';

type HeadOptions = {
  auth?: TigrisAuthOptions;
};

type HeadResponse = {
  size: number;
  modified: Date;
  contentType: string;
  contentDisposition: string;
  url: string;
  downloadUrl: string;
  path: string;
};

export async function head(
  path: string,
  options?: HeadOptions
): Promise<HeadResponse | undefined> {
  const tigrisClient = createTigrisClient(options?.auth);
  const head = new HeadObjectCommand({
    Bucket: options?.auth?.tigrisStorageBucket ?? config.tigrisStorageBucket,
    Key: path,
  });
  return tigrisClient
    .send(head)
    .then(async (res) => {
      return {
        size: res.ContentLength ?? 0,
        modified: res.LastModified ?? new Date(),
        contentType: res.ContentType ?? '',
        contentDisposition: res.ContentDisposition ?? '',
        url: res.ContentDisposition ?? '',
        downloadUrl: res.ContentDisposition ?? '',
        path: path,
      };
    })
    .catch(() => {
      return undefined;
    });
}
