import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { addSnapshotVersionMiddleware } from './middleware';

export type HeadOptions = {
  snapshotVersion?: string;
  versionId?: string;
  config?: TigrisStorageConfig;
};

export type HeadResponse = {
  contentDisposition: string;
  contentType: string;
  etag: string;
  metadata: Record<string, string>;
  modified: Date;
  path: string;
  size: number;
  url: string;
};

export async function head(
  path: string,
  options?: HeadOptions
): Promise<TigrisStorageResponse<HeadResponse | undefined, Error>> {
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const head = new HeadObjectCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    VersionId: options?.versionId,
  });

  if (options?.snapshotVersion) {
    addSnapshotVersionMiddleware(head.middlewareStack, options.snapshotVersion);
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
            etag: res.ETag ?? '',
            metadata: res.Metadata ?? {},
            url: await getSignedUrl(tigrisClient, head, {
              expiresIn: 3600,
            }),
            path: path,
          },
        };
      })
      .catch((error) => {
        if (error.name === 'NotFound') {
          return {
            data: undefined,
          };
        }

        return {
          error: new Error(
            'An error occurred while getting metadata of the object'
          ),
        };
      });
  } catch {
    return {
      error: new Error(
        'An error occurred while getting metadata of the object'
      ),
    };
  }
}
