import { TigrisStorageResponse } from '../types';
import { addRandomSuffix } from '../utils';
import { UploadAction } from './shared';

export type UploadOptions = {
  access?: 'public' | 'private';
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
  url?: string;
  multipart?: boolean;
  partSize?: number;
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

export type UploadResponse = {
  contentDisposition?: string;
  contentType?: string;
  modified: Date;
  name: string;
  /**
   * @deprecated Use `name` instead. Will be removed in the next major version.
   */
  path?: string;
  size: number;
  url: string;
};

export async function upload(
  name: string,
  data: File | Blob,
  options?: UploadOptions
): Promise<TigrisStorageResponse<UploadResponse, Error>> {
  if (!options?.url) {
    return {
      error: new Error('URL option is required for client uploads'),
    };
  }

  if (options?.addRandomSuffix) {
    name = addRandomSuffix(name);
  }

  const partSize = options?.partSize ?? 5 * 1024 * 1024; // 5MB default

  if (options?.multipart) {
    return uploadMultipart(name, data, options, partSize);
  } else {
    return uploadSingle(name, data, options);
  }
}

async function uploadSingle(
  name: string,
  data: File | Blob,
  options?: UploadOptions
): Promise<TigrisStorageResponse<UploadResponse, Error>> {
  if (!options?.url) {
    return {
      error: new Error('URL option is required for client uploads'),
    };
  }

  try {
    // Get presigned URL
    const presignedResponse = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        path: name,
        action: UploadAction.SinglepartInit,
        operation: 'put',
        contentType: options?.contentType ?? data.type,
      }),
    });

    // Check if presigned URL is valid
    if (!presignedResponse.ok) {
      return {
        error: new Error(
          `Failed to get presigned URL: ${presignedResponse.statusText}`
        ),
      };
    }

    // Get presigned URL
    const response = await presignedResponse.json();

    if (!response.data?.url) {
      return {
        error: new Error('Failed to get presigned URL'),
      };
    }

    const presignedUrl = response.data.url;

    // Upload file
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && options?.onUploadProgress) {
          const percentage = Math.round((event.loaded / event.total) * 100);
          options.onUploadProgress({
            loaded: event.loaded,
            total: event.total,
            percentage,
          });
        }
      });

      // Handle success
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      // Handle error
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed due to network error'));
      });

      // Open request
      xhr.open('PUT', presignedUrl);

      if (options?.contentType || data.type) {
        xhr.setRequestHeader('Content-Type', options?.contentType ?? data.type);
      }

      // Send data
      xhr.send(data);
    })
      .then(() => {
        // Return response
        return {
          data: {
            contentDisposition: options?.contentDisposition,
            contentType: options?.contentType ?? data.type,
            modified: new Date(),
            name,
            path: name,
            size: data.size,
            url: presignedUrl.replace('x-id=PutObject', 'x-id=GetObject'),
          },
        };
      })
      .catch((error) => {
        // Return error
        return {
          error: new Error(error),
        };
      });
  } catch {
    // Return error
    return {
      error: new Error('Single upload failed'),
    };
  }
}

async function uploadMultipart(
  name: string,
  data: File | Blob,
  options?: UploadOptions,
  partSize: number = 5 * 1024 * 1024
): Promise<TigrisStorageResponse<UploadResponse, Error>> {
  if (!options?.url) {
    return {
      error: new Error('URL option is required for client uploads'),
    };
  }

  try {
    // Step 1: Initialize multipart upload via API endpoint
    const initResponse = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        path: name,
        action: UploadAction.MultipartInit,
        contentType: options?.contentType ?? data.type,
      }),
    });

    if (!initResponse.ok) {
      return {
        error: new Error(
          `Failed to initialize multipart upload: ${initResponse.statusText}`
        ),
      };
    }

    const { data: initData } = await initResponse.json();
    const { uploadId } = initData;

    // Step 2: Split file into parts and get presigned URLs
    const totalParts = Math.ceil(data.size / partSize);
    const parts = Array.from({ length: totalParts }, (_, i) => i + 1);

    const urlResponse = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        path: name,
        action: UploadAction.MultipartGetParts,
        uploadId,
        parts,
      }),
    });

    if (!urlResponse.ok) {
      return {
        error: new Error(`Failed to get part URLs: ${urlResponse.statusText}`),
      };
    }

    const { data: urlData } = await urlResponse.json();
    const partUrls = urlData;

    // Step 3: Upload parts with progress tracking
    let totalUploaded = 0;
    const uploadPromises = partUrls.map(
      ({ part, url }: { part: number; url: string }, index: number) => {
        const start = index * partSize;
        const end = Math.min(start + partSize, data.size);
        const chunk = data.slice(start, end);

        return new Promise<Record<number, string>>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && options?.onUploadProgress) {
              const partLoaded = event.loaded;
              const currentTotal = totalUploaded + partLoaded;
              const percentage = Math.round((currentTotal / data.size) * 100);

              options.onUploadProgress({
                loaded: currentTotal,
                total: data.size,
                percentage,
              });
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              totalUploaded += chunk.size;
              options?.onUploadProgress?.({
                loaded: totalUploaded,
                total: data.size,
                percentage: Math.round((totalUploaded / data.size) * 100),
              });
              resolve({ [part]: xhr.getResponseHeader('ETag') ?? '' });
            } else {
              reject(
                new Error(
                  `Part ${part} upload failed with status: ${xhr.status}`
                )
              );
            }
          });

          xhr.addEventListener('error', () => {
            reject(
              new Error(`Part ${part} upload failed due to network error`)
            );
          });

          xhr.open('PUT', url);
          xhr.send(chunk);
        });
      }
    );

    const partIds = await Promise.all(uploadPromises);

    // Step 4: Complete multipart upload
    const completeResponse = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        path: name,
        action: UploadAction.MultipartComplete,
        uploadId,
        partIds,
      }),
    });

    if (!completeResponse.ok) {
      return {
        error: new Error(
          `Failed to complete multipart upload: ${completeResponse.statusText}`
        ),
      };
    }

    const { data: completeData } = await completeResponse.json();

    return {
      data: {
        contentDisposition: options?.contentDisposition,
        contentType: options?.contentType ?? data.type,
        modified: new Date(),
        name,
        path: name,
        size: data.size,
        url: completeData?.url ?? '',
      },
    };
  } catch (error) {
    return {
      error: new Error(
        `Multipart upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}
