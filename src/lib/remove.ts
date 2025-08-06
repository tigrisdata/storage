import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../utils/s3-client';

export async function remove(path: string): Promise<void> {
  const s3Client = createS3Client();
  const remove = new DeleteObjectCommand({
    Bucket: process.env.TIGRIS_STORAGE_BUCKET,
    Key: path,
  });
  await s3Client.send(remove);
}
