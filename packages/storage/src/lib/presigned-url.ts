import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { createTigrisClient } from './tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export type GetPresignedUrlOptions = {
  method: 'get' | 'put';
  expiresIn?: number;
  contentType?: string;
  config?: TigrisStorageConfig;
};

export type GetPresignedUrlResponse = {
  url: string;
  method: 'get' | 'put';
  expiresIn: number;
};

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

  try {
    let signedUrl: string;

    if (options.method === 'put') {
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
        method: options.method,
        expiresIn,
      },
    };
  } catch (error) {
    return {
      error: new Error(`Failed to generate presigned URL: ${error}`),
    };
  }
}
