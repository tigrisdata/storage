import { S3Client } from '@aws-sdk/client-s3';

import 'dotenv/config';

export function createS3Client() {
  const {
    TIGRIS_STORAGE_ACCESS_KEY_ID,
    TIGRIS_STORAGE_SECRET_ACCESS_KEY,
    TIGRIS_STORAGE_ENDPOINT_URL,
  } = process.env;

  const accessKeyId = TIGRIS_STORAGE_ACCESS_KEY_ID ?? '';
  const secretAccessKey = TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '';
  const region = 'auto';
  const endpoint = TIGRIS_STORAGE_ENDPOINT_URL ?? 'https://t3.storage.dev';

  return new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region,
    endpoint,
  });
}
