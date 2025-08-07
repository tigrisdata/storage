import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTigrisClient, TigrisAuthOptions } from './tigris-client';
import { config } from './config';

type ListOptions = {
  limit?: number;
  paginationMarker?: string;
  auth?: TigrisAuthOptions;
};

type Item = {
  id: string;
  name: string;
  size: number;
  lastModified: Date;
};

type ListResponse = {
  items: Item[];
  paginationToken: string | undefined;
  hasMore: boolean;
};

export async function list(options?: ListOptions): Promise<ListResponse> {
  const tigrisClient = createTigrisClient(options?.auth);
  const list = new ListObjectsV2Command({
    Bucket: options?.auth?.tigrisStorageBucket ?? config.tigrisStorageBucket,
    MaxKeys: options?.limit,
    ContinuationToken: options?.paginationMarker,
  });

  return tigrisClient.send(list).then((res) => {
    return {
      items:
        res.Contents?.map((item) => ({
          id: item.ETag?.replace(/"/g, '') ?? '',
          name: item.Key ?? '',
          size: item.Size ?? 0,
          lastModified: item.LastModified ?? new Date(),
        })) ?? [],
      paginationToken: res.NextContinuationToken,
      hasMore: res.IsTruncated ?? false,
    };
  });
}
