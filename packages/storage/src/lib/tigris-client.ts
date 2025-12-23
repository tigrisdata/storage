import { S3Client } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { config, missingConfigError } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

const cachedClients = new Map<string, S3Client>();

export function createTigrisClient(
  options?: TigrisStorageConfig,
  skipBucketCheck: boolean | undefined = false
): TigrisStorageResponse<S3Client, Error> {
  const accessKeyId = options?.accessKeyId ?? config.accessKeyId;
  const secretAccessKey = options?.secretAccessKey ?? config.secretAccessKey;
  const endpoint = options?.endpoint ?? config.endpoint;
  const bucket = options?.bucket ?? config.bucket;

  const skipAccessKeyCheck =
    options?.sessionToken !== undefined &&
    options?.organizationId !== undefined &&
    options.sessionToken !== '' &&
    options.organizationId !== '';

  if (!bucket && !skipBucketCheck) {
    return missingConfigError('bucket');
  }

  if (!skipAccessKeyCheck && (!accessKeyId || accessKeyId === '')) {
    return missingConfigError('accessKeyId');
  }

  if (!skipAccessKeyCheck && (!secretAccessKey || secretAccessKey === '')) {
    return missingConfigError('secretAccessKey');
  }

  if (!endpoint || endpoint === '') {
    return missingConfigError('endpoint');
  }

  let key = `${accessKeyId}-${endpoint}`;

  if (options?.sessionToken && options?.organizationId) {
    key = `${options.sessionToken}-${options.organizationId}-${endpoint}`;
  }

  const cachedClient = cachedClients.get(key);

  if (cachedClient !== undefined) {
    return { data: cachedClient };
  }

  const client = new S3Client({
    credentials: {
      accessKeyId: accessKeyId ?? '',
      secretAccessKey: secretAccessKey ?? '',
      sessionToken: options?.sessionToken ?? undefined,
    },
    region: 'auto',
    endpoint: endpoint ?? 'https://t3.storage.dev',
  });

  if (options?.sessionToken && options?.organizationId) {
    client.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers[TigrisHeaders.NAMESPACE] = options.organizationId!;
        const result = await next(args);
        return result;
      },
      {
        name: 'x-Tigris-Namespace-Middleware',
        step: 'build',
        override: true,
      }
    );
  }

  if (!client) {
    return { error: new Error('Unable to create Tigris client') };
  }

  cachedClients.set(key, client);

  return { data: client };
}
