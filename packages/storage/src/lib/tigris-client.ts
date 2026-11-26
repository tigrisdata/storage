import { S3Client } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { getConfig, missingConfigError, temporarySessionToken } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

const cachedClients = new Map<string, S3Client>();

export function createTigrisClient(
  options?: TigrisStorageConfig,
  skipBucketCheck: boolean | undefined = false
): TigrisStorageResponse<S3Client, Error> {
  const config = getConfig();
  const accessKeyId = options?.accessKeyId ?? config.accessKeyId;
  const secretAccessKey = options?.secretAccessKey ?? config.secretAccessKey;
  const endpoint = options?.endpoint ?? config.endpoint;
  const bucket = options?.bucket ?? config.bucket;
  const forcePathStyle = options?.forcePathStyle ?? false;
  const temporaryToken = temporarySessionToken(options);
  const hasOrganization =
    options?.organizationId !== undefined && options.organizationId !== '';

  // With an organization, a provider returns OAuth tokens; without one it
  // returns access keys, temporary or not, like any AWS credential provider.
  const hasCredentialProvider = options?.credentialProvider !== undefined;

  // A session token without its key pair is an OAuth access token.
  const isOAuth =
    !temporaryToken &&
    options?.sessionToken !== undefined &&
    options.sessionToken !== '' &&
    hasOrganization;

  const skipAccessKeyCheck = hasCredentialProvider || isOAuth;

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

  let key: string | undefined = `${accessKeyId}-${endpoint}`;

  if (hasCredentialProvider) {
    // Credential providers are opaque functions — cannot safely cache
    key = undefined;
  } else if (isOAuth) {
    key = `${options!.sessionToken}-${options!.organizationId}-${endpoint}`;
  } else if (temporaryToken) {
    key = `${key}-${temporaryToken}`;
  }

  if (key && forcePathStyle) {
    key = `${key}-forcePathStyle`;
  }

  if (key) {
    const cachedClient = cachedClients.get(key);
    if (cachedClient !== undefined) {
      return { data: cachedClient };
    }
  }

  const credentials = hasCredentialProvider
    ? options!.credentialProvider!
    : {
        accessKeyId: accessKeyId ?? '',
        secretAccessKey: secretAccessKey ?? '',
        sessionToken: temporaryToken ?? options?.sessionToken ?? undefined,
      };

  const client = new S3Client({
    credentials,
    region: 'auto',
    endpoint: endpoint ?? 'https://t3.storage.dev',
    forcePathStyle,
  });

  if ((isOAuth || hasCredentialProvider) && hasOrganization) {
    client.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers[TigrisHeaders.NAMESPACE] = options!.organizationId!;
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

  if (key) {
    cachedClients.set(key, client);
  }

  return { data: client };
}
