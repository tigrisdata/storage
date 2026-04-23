import { toError } from '@shared/utils';
import {
  completeMultipartUpload,
  getPartsPresignedUrls,
  initMultipartUpload,
} from '../object/multipart';
import { getPresignedUrl } from '../object/presigned-url';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { UploadAction } from './shared';

export interface ClientUploadRequest {
  action: UploadAction;
  name: string;
  /** @deprecated This property is no longer used by the server handler. Will be removed in the next major version. */
  contentType?: string;
  uploadId?: string;
  parts?: number[];
  partIds?: Array<{ [key: number]: string }>;
}

export async function handleClientUpload(
  request: ClientUploadRequest,
  config?: TigrisStorageConfig
): Promise<TigrisStorageResponse<unknown, Error>> {
  const { action, name, uploadId, parts, partIds } = request;

  try {
    switch (action) {
      case UploadAction.SinglepartInit:
        return await getPresignedUrl(name, {
          operation: 'put',
          expiresIn: 3600, // 1 hour
          config,
        });
      case UploadAction.MultipartInit:
        return await initMultipartUpload(name, {
          config,
        });
      case UploadAction.MultipartGetParts:
        if (!uploadId || !parts) {
          return {
            error: new Error(
              'uploadId and parts are required for multipart-parts'
            ),
          };
        }
        return await getPartsPresignedUrls(name, parts, uploadId, {
          config,
        });
      case UploadAction.MultipartComplete:
        if (!uploadId || !partIds) {
          return {
            error: new Error(
              'uploadId and partIds are required for multipart-complete'
            ),
          };
        }
        return await completeMultipartUpload(name, uploadId, partIds, {
          config,
        });
      default:
        return {
          error: new Error(`Invalid action: ${action}`),
        };
    }
  } catch (error) {
    return { error: toError(error) };
  }
}
