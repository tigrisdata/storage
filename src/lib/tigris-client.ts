import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';

type TigrisClientOptions = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
};

export type TigrisAuthOptions = TigrisClientOptions & {
  tigrisStorageBucket: string;
};

export function createTigrisClient(options?: TigrisClientOptions) {
  const { accessKeyId, secretAccessKey, endpoint } = options ?? config;

  return new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region: 'auto',
    endpoint: endpoint ?? 'https://t3.storage.dev',
  });
}
