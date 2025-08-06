import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createS3Client } from '../utils/s3-client';

type ListOptions = {
  limit?: number;
  paginationMarker?: string;
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
  const s3Client = createS3Client();
  const list = new ListObjectsV2Command({
    Bucket: process.env.TIGRIS_STORAGE_BUCKET,
    MaxKeys: options?.limit,
    ContinuationToken: options?.paginationMarker,
  });

  return s3Client.send(list).then((res) => {
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
