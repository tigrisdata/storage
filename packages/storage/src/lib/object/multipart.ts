import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { toError } from '@shared/utils';
import { getConfig } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { FILE_EXISTS_ERROR_MESSAGE, isPreconditionFailed } from './overwrite';
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
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const createCommand = new CreateMultipartUploadCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
  });

  try {
    const { UploadId } = await tigrisClient.send(createCommand);

    if (!UploadId) {
      return { error: new Error('Unable to initialize multipart upload') };
    }

    return {
      data: {
        uploadId: UploadId,
      },
    };
  } catch (error) {
    return {
      error: new Error(
        `Unable to initialize multipart upload: ${toError(error).message}`
      ),
    };
  }
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
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  return await Promise.all(
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
  )
    .then((presignedUrls) => {
      return {
        data: presignedUrls.map((presignedUrl, index) => {
          return {
            part: parts[index],
            url: presignedUrl,
          };
        }),
      };
    })
    .catch(() => {
      return {
        error: new Error(`Failed to get part URLs`),
      };
    });
}

export type CompleteMultipartUploadOptions = {
  /**
   * When `false`, the upload only completes if no object exists at `path`
   * (sent as `If-None-Match: *`). Default is `true`.
   */
  allowOverwrite?: boolean;
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
  const config = getConfig();
  const { data: tigrisClient, error } = createTigrisClient(options?.config);

  if (error) {
    return { error };
  }

  const completeCommand = new CompleteMultipartUploadCommand({
    Bucket: options?.config?.bucket ?? config.bucket,
    Key: path,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: partIds.flatMap((parts) =>
        Object.keys(parts).map((partNumber) => ({
          ETag: parts[parseInt(partNumber, 10)],
          PartNumber: parseInt(partNumber, 10),
        }))
      ),
    },
    ...(options?.allowOverwrite === false ? { IfNoneMatch: '*' } : {}),
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
  } catch (error) {
    if (options?.allowOverwrite === false && isPreconditionFailed(error)) {
      // The upload can never complete now, so drop its parts. Other failures
      // keep the upload, since completing again with the same ID may work.
      await tigrisClient
        .send(
          new AbortMultipartUploadCommand({
            Bucket: options?.config?.bucket ?? config.bucket,
            Key: path,
            UploadId: uploadId,
          })
        )
        .catch(() => {});
      return { error: new Error(FILE_EXISTS_ERROR_MESSAGE) };
    }
    return {
      error: new Error(`Unable to complete multipart upload`),
    };
  }
}
