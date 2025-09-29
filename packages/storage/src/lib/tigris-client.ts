import { S3Client } from '@aws-sdk/client-s3';
import { config, missingConfigError } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export function createTigrisClient(
  options?: TigrisStorageConfig,
  skipBucketCheck: boolean | undefined = false
): TigrisStorageResponse<S3Client, Error> {
  const accessKeyId = options?.accessKeyId ?? config.accessKeyId;
  const secretAccessKey = options?.secretAccessKey ?? config.secretAccessKey;
  const endpoint = options?.endpoint ?? config.endpoint;
  const bucket = options?.bucket ?? config.bucket;

  if (!bucket && !skipBucketCheck) {
    return missingConfigError('bucket');
  }

  if (!accessKeyId || accessKeyId === '') {
    return missingConfigError('accessKeyId');
  }

  if (!secretAccessKey || secretAccessKey === '') {
    return missingConfigError('secretAccessKey');
  }

  if (!endpoint || endpoint === '') {
    return missingConfigError('endpoint');
  }

  const client = new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region: 'auto',
    endpoint: endpoint ?? 'https://t3.storage.dev',
  });

  if (!client) {
    return { error: new Error('Unable to create Tigris client') };
  }

  return {
    data: client,
  };
}
