import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';
import { config } from './config';
import { createTigrisClient } from './tigris-client';
import { getPresignedUrl } from './presigned-url';

export type InitMultipartUploadOptions = {
  config?: TigrisStorageConfig;
};

export type InitMultipartUploadResponse = {
  uploadId: string;
};

export async function initMultipartUpload(
  path: string,
  options?: InitMultipartUploadOptions
): Promise<TigrisStorageResponse<InitMultipartUploadResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const createCommand = new CreateMultipartUploadCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });

  const { UploadId } = await tigrisClient.send(createCommand);

  if (!UploadId) {
    return { error: new Error('Unable to initialize multipart upload') };
  }

  return {
    data: {
      uploadId: UploadId,
    },
  };
}

export type GetPartsPresignedUrlsOptions = {
  config?: TigrisStorageConfig;
};

export type GetPartsPresignedUrlsResponse = Array<{
  part: number;
  url: string;
}>;

export async function getPartsPresignedUrls(
  path: string,
  parts: number[],
  uploadId: string,
  options?: GetPartsPresignedUrlsOptions
): Promise<TigrisStorageResponse<GetPartsPresignedUrlsResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const presignedUrls = await Promise.all(
    parts.map((part) => {
      return getSignedUrl(
        tigrisClient,
        new UploadPartCommand({
          Bucket: options?.config?.bucket ?? config.bucket,
          Key: path,
          PartNumber: part,
          UploadId: uploadId,
        }),
        { expiresIn: 3600 }
      );
    })
  );

  return {
    data: presignedUrls.map((presignedUrl, index) => {
      return {
        part: parts[index],
        url: presignedUrl,
      };
    }),
  };
}

export type CompleteMultipartUploadOptions = {
  config?: TigrisStorageConfig;
};

export type CompleteMultipartUploadResponse = {
  path: string;
  url: string;
};

export async function completeMultipartUpload(
  path: string,
  uploadId: string,
  partIds: Array<{ [key: number]: string }>,
  options?: CompleteMultipartUploadOptions
): Promise<TigrisStorageResponse<CompleteMultipartUploadResponse, Error>> {
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error || !tigrisClient) {
    return { error };
  }

  const completeCommand = new CompleteMultipartUploadCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: partIds.flatMap((parts) =>
        Object.keys(parts).map((partNumber) => ({
          ETag: parts[parseInt(partNumber)],
          PartNumber: parseInt(partNumber),
        }))
      ),
    },
  });

  try {
    const result = await tigrisClient.send(completeCommand);

    if (result) {
      const signedUrl = await getPresignedUrl(path, {
        config: options?.config,
        operation: 'get',
        expiresIn: 3600,
      });

      return {
        data: {
          path,
          url: signedUrl.data?.url ?? '',
        },
      };
    } else {
      return {
        error: new Error(`Unable to complete multipart upload`),
      };
    }
  } catch {
    return {
      error: new Error(`Unable to complete multipart upload`),
    };
  }
}
