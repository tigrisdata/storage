import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export type GetPresignedUrlOperation = 'get' | 'put';

type MethodOrOperation =
  | {
      method: GetPresignedUrlOperation;
      operation?: never;
    }
  | {
      operation: GetPresignedUrlOperation;
      method?: never;
    };

export type GetPresignedUrlOptions = {
  expiresIn?: number;
  contentType?: string;
  config?: TigrisStorageConfig;
} & MethodOrOperation;

export type GetPresignedUrlResponse = {
  url: string;
  expiresIn: number;
} & MethodOrOperation;

export async function getPresignedUrl(
  path: string,
  options: GetPresignedUrlOptions
): Promise<TigrisStorageResponse<GetPresignedUrlResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const bucket = options?.config?.bucket ?? config.bucket;
  const expiresIn = options.expiresIn ?? 3600; // 1 hour default
  const operation = options.operation ?? options.method;

  if (!operation) {
    return {
      error: new Error(
        'Operation is required, possible values are `get` and `put`'
      ),
    };
  }

  try {
    let signedUrl: string;

    if (operation === 'put') {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        ContentType: options.contentType,
      });
      signedUrl = await getSignedUrl(tigrisClient, command, { expiresIn });
    } else {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path,
      });
      signedUrl = await getSignedUrl(tigrisClient, command, { expiresIn });
    }

    return {
      data: {
        url: signedUrl,
        ...(operation ? { operation } : { method: operation }),
        expiresIn,
      },
    };
  } catch (error) {
    return {
      error: new Error(`Failed to generate presigned URL: ${error}`),
    };
  }
}
