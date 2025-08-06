import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../utils/s3-client';

type HeadResponse = {
  size: number;
  modified: Date;
  contentType: string;
  contentDisposition: string;
  url: string;
  downloadUrl: string;
  path: string;
};

export async function head(path: string): Promise<HeadResponse | undefined> {
  const s3Client = createS3Client();
  const head = new HeadObjectCommand({
    Bucket: process.env.TIGRIS_STORAGE_BUCKET,
    Key: path,
  });
  return s3Client
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
