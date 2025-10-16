import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { HttpRequest } from '@aws-sdk/types';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type HeadOptions = {
  snapshotVersion?: string;
  config?: TigrisStorageConfig;
};

export type HeadResponse = {
  contentDisposition: string;
  contentType: string;
  modified: Date;
  path: string;
  size: number;
  url: string;
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

  if (options?.snapshotVersion) {
    head.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers['X-Tigris-Snapshot-Version'] = `${options.snapshotVersion}`;
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
      .send(head)
      .then(async (res) => {
        return {
          data: {
            size: res.ContentLength ?? 0,
            modified: res.LastModified ?? new Date(),
            contentType: res.ContentType ?? '',
            contentDisposition: res.ContentDisposition ?? '',
            url: await getSignedUrl(tigrisClient, head, {
              expiresIn: 3600,
            }),
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
