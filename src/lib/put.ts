import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { head } from './head';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

type PutOnUploadProgress = ({
  loaded,
  total,
  percentage,
}: {
  loaded: number;
  total: number;
  percentage: number;
}) => void;

type PutOptions = {
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

type PutResponse = {
  contentDisposition: string | undefined;
  contentType: string | undefined;
  modified: Date;
  path: string;
  size: number;
  url: string;
};

export async function put(
  path: string,
  data: string | ReadableStream | Blob | Buffer,
  options?: PutOptions
): Promise<TigrisStorageResponse<PutResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  if (options?.addRandomSuffix) {
    path = `${path.split('.')[0]}-${Math.random().toString(36).substring(2, 15)}.${path.split('.')[1] ?? ''}`;
  }

  if (!options?.allowOverwrite) {
    const headResult = await head(path);
    if (headResult) {
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
      Body: data,
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
  } catch (error) {
    return {
      error:
        (error as { Code?: string }).Code === 'AccessDenied'
          ? new Error(
              `Access denied while uploading to Tigris Storage. Please check your credentials.`
            )
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
