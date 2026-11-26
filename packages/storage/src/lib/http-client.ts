import { createTigrisHttpClient, type TigrisHttpClient } from '@shared/index';
import { getConfig, temporarySessionToken } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

function getStorageEndpoint(options?: TigrisStorageConfig): string {
  return options?.endpoint ?? getConfig().endpoint ?? 'https://t3.storage.dev';
}

export function createStorageClient(
  options?: TigrisStorageConfig
): TigrisStorageResponse<TigrisHttpClient, Error> {
  const config = getConfig();
  const temporaryToken = temporarySessionToken(options);
  const oauthToken = temporaryToken
    ? undefined
    : (options?.sessionToken ?? config.sessionToken);
  const organizationId = options?.organizationId ?? config.organizationId;
  // An OAuth token wins over a key pair, so keep the key pair out of it.
  const accessKeyId = oauthToken
    ? undefined
    : (options?.accessKeyId ?? config.accessKeyId);
  const secretAccessKey = oauthToken
    ? undefined
    : (options?.secretAccessKey ?? config.secretAccessKey);

  // Allow either session token, authorization, or credentials
  const hasCredentials = accessKeyId && secretAccessKey;
  if (!oauthToken && !hasCredentials) {
    return {
      error: new Error('Session token or credentials are required'),
    };
  }

  if (oauthToken && (!organizationId || organizationId === '')) {
    return { error: new Error('Organization ID is required') };
  }

  return createTigrisHttpClient({
    baseUrl: getStorageEndpoint(options),
    sessionToken: oauthToken ?? temporaryToken,
    organizationId,
    accessKeyId,
    secretAccessKey,
    retry: options?.retry ?? config.retry,
  });
}
