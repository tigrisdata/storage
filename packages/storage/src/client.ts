
export type ClientUploadOptions = {
  access?: 'public' | 'private';
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
  url?: string;
  onUploadProgress?: ({
    loaded,
    total,
    percentage,
  }: {
    loaded: number;
    total: number;
    percentage: number;
  }) => void;
};

export type ClientUploadResponse = {
  contentDisposition?: string;
  contentType?: string;
  modified: Date;
  path: string;
  size: number;
  url: string;
};

export async function clientUpload(
  path: string,
  data: File | Blob,
  options?: ClientUploadOptions
): Promise<ClientUploadResponse> {
  if (!options?.url) {
    throw new Error('URL option is required for clientUpload');
  }

  if (options?.addRandomSuffix) {
    const pathParts = path.split('.');
    const extension = pathParts.length > 1 ? pathParts.pop() : '';
    const baseName = pathParts.join('.');
    path = `${baseName}-${Math.random().toString(36).substring(2, 15)}${extension ? `.${extension}` : ''}`;
  }

  try {
    // Step 1: Request presigned URL from server
    const presignedResponse = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path,
        method: 'put',
        contentType: options.contentType || data.type,
      }),
    });

    if (!presignedResponse.ok) {
      throw new Error(`Failed to get presigned URL: ${presignedResponse.statusText}`);
    }

    const { data: presignedData } = await presignedResponse.json();
    const presignedUrl = presignedData.url;

    // Step 2: Upload directly to presigned URL using XMLHttpRequest
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
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

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed due to network error'));
      });

      xhr.open('PUT', presignedUrl);

      // Set content type if provided
      if (options?.contentType || data.type) {
        xhr.setRequestHeader('Content-Type', options?.contentType || data.type);
      }

      xhr.send(data);
    });

    return {
      contentDisposition: options?.contentDisposition,
      contentType: options?.contentType || data.type,
      modified: new Date(),
      path,
      size: data.size,
      url: presignedUrl.split('?')[0], // Clean URL without query params
    };
  } catch (error) {
    throw new Error(`clientUpload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}