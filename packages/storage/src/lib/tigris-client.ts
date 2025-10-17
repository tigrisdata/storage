import { S3Client } from '@aws-sdk/client-s3';
import { config, missingConfigError } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export enum TigrisHeaders {
  SNAPSHOT = 'X-Tigris-Snapshot',
  SNAPSHOT_VERSION = 'X-Tigris-Snapshot-Version',
  SNAPSHOT_ENABLED = 'X-Tigris-Enable-Snapshot',
  HAS_FORKS = 'X-Tigris-Is-Fork-Parent',
  FORK_SOURCE_BUCKET = 'X-Tigris-Fork-Source-Bucket',
  FORK_SOURCE_BUCKET_SNAPSHOT = 'X-Tigris-Fork-Source-Bucket-Snapshot',
}

const cachedClients = new Map<string, S3Client>();

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

  const key = `${accessKeyId}-${secretAccessKey}-${endpoint}-${bucket}`;

  const cachedClient = cachedClients.get(key);

  if (cachedClient !== undefined) {
    return { data: cachedClient };
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

  cachedClients.set(key, client);

  return {
    data: client,
  };
}
