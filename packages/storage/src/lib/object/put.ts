import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { addRandomSuffix } from '../utils';
import { head } from './head';

export type PutOnUploadProgress = ({
  loaded,
  total,
  percentage,
}: {
  loaded: number;
  total: number;
  percentage: number;
}) => void;

export type PutOptions = {
  access?: 'public' | 'private';
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
  multipart?: boolean;
  abortController?: AbortController;
  onUploadProgress?: PutOnUploadProgress;
  config?: TigrisStorageConfig;
};

export type PutResponse = {
  contentDisposition: string | undefined;
  contentType: string | undefined;
  modified: Date;
  path: string;
  size: number;
  url: string;
};

export async function put(
  path: string,
  body: string | ReadableStream | Blob | Buffer,
  options?: PutOptions
): Promise<TigrisStorageResponse<PutResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  if (options?.addRandomSuffix) {
    path = addRandomSuffix(path);
  }

  const allowOverwrite = options?.allowOverwrite ?? true;

  if (!allowOverwrite) {
    const headResult = await head(path, { config: options?.config });
    if (headResult !== undefined && headResult.data !== undefined) {
      return {
        error: new Error('File already exists'),
      };
    }
  }

  const contentDisposition =
    options && options.contentDisposition
      ? options.contentDisposition === 'attachment'
        ? `attachment; filename="${path}"`
        : 'inline'
      : undefined;

  const access =
    options && options.access === 'public' ? 'public-read' : 'private';

  const upload = new Upload({
    client: tigrisClient,
    params: {
      Bucket: options?.config?.bucket ?? config.bucket,
      Key: path,
      Body: body,
      ContentType: options?.contentType ?? undefined,
      ContentDisposition: contentDisposition,
      ACL: access,
    },
    partSize: options?.multipart ? 1024 * 1024 * 5 : 0,
    leavePartsOnError: options?.multipart ? false : true,
    abortController: options?.abortController
      ? options.abortController
      : new AbortController(),
  });

  let contentSize = 0;

  // Track progress
  upload.on('httpUploadProgress', (progress) => {
    if (contentSize === 0) {
      contentSize = progress.total ?? 0;
    }

    if (progress && options?.onUploadProgress) {
      options.onUploadProgress({
        loaded: progress.loaded ?? 0,
        total: progress.total ?? 0,
        percentage: Math.round(
          ((progress.loaded ?? 0) / (progress.total ?? 0)) * 100
        ),
      });
    }
  });

  try {
    await upload.done();
  } catch (error: any) {
    return {
      error: error.message
        ? new Error(error.message)
        : new Error(`Unexpected error while uploading to Tigris Storage`),
    };
  }

  let signedUrl: string;

  if (options?.access === 'public') {
    signedUrl = await getSignedUrl(
      tigrisClient,
      new GetObjectCommand({
        Bucket: options?.config?.bucket ?? config.bucket,
        Key: path,
      })
    ).then((url) => url.split('?X-Amz-Algorithm=')[0]);
  } else {
    signedUrl = await getSignedUrl(
      tigrisClient,
      new GetObjectCommand({
        Bucket: options?.config?.bucket ?? config.bucket,
        Key: path,
      }),
      {
        expiresIn: 3600,
      }
    );
  }

  if (contentSize === 0) {
    const fileInfo = await head(path, { config: options?.config });
    if (fileInfo.data !== undefined) {
      contentSize = fileInfo.data.size;
    }
  }

  return {
    data: {
      contentDisposition: options?.contentDisposition ?? undefined,
      contentType: options?.contentType ?? undefined,
      modified: new Date(),
      size: contentSize,
      path,
      url: signedUrl,
    },
  };
}
