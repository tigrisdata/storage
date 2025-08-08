import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';
import { config } from './config';

type HeadOptions = {
  config?: TigrisStorageConfig;
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
): Promise<TigrisStorageResponse<HeadResponse, Error> | undefined> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);
  if (error || !tigrisClient) {
    return { error };
  }

  const head = new HeadObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });

  try {
    return tigrisClient
      .send(head)
      .then(async (res) => {
        return {
          data: {
            size: res.ContentLength ?? 0,
            modified: res.LastModified ?? new Date(),
            contentType: res.ContentType ?? '',
            contentDisposition: res.ContentDisposition ?? '',
            url: res.ContentDisposition ?? '',
            downloadUrl: res.ContentDisposition ?? '',
            path: path,
          },
        };
      })
      .catch(() => {
        return undefined;
      });
  } catch {
    return {
      error: new Error('An error occurred while fetching the file'),
    };
  }
}
