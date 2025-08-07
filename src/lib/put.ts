import { Upload } from '@aws-sdk/lib-storage';
import { createTigrisClient, TigrisAuthOptions } from './tigris-client';
import { head } from './head';
import { config } from './config';

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
  auth?: TigrisAuthOptions;
};

type PutResponse = {
  path: string;
  contentType: string;
  contentDisposition: string;
  url: string;
  downloadUrl: string;
};

export async function put(
  path: string,
  data: string | ReadableStream | Blob,
  options?: PutOptions
): Promise<PutResponse> {
  const tigrisClient = createTigrisClient(options?.auth);

  if (options?.addRandomSuffix) {
    path = `${path.split('.')[0]}-${Math.random().toString(36).substring(2, 15)}.${path.split('.')[1] ?? ''}`;
  }

  if (!options?.allowOverwrite) {
    console.log('head', path);
    const headResult = await head(path);
    if (headResult) {
      throw new Error('File already exists');
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
      Bucket: options?.auth?.tigrisStorageBucket ?? config.tigrisStorageBucket,
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

  // Track progress
  upload.on('httpUploadProgress', (progress) => {
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

  await upload.done();

  return {
    path,
    contentType: options?.contentType ?? '',
    contentDisposition: contentDisposition ?? '',
    url: ``,
    downloadUrl: ``,
  };
}
