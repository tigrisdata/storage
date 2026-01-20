import { createTigrisHttpClient, type TigrisHttpClient } from '@shared/index';
import { config } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

function getStorageEndpoint(options?: TigrisStorageConfig): string {
  return options?.endpoint ?? config.endpoint ?? 'https://t3.storage.dev';
}

export function createStorageClient(
  options?: TigrisStorageConfig
): TigrisStorageResponse<TigrisHttpClient, Error> {
  const sessionToken = options?.sessionToken ?? config.sessionToken;
  const organizationId = options?.organizationId ?? config.organizationId;
  const accessKeyId = options?.accessKeyId ?? config.accessKeyId;
  const secretAccessKey = options?.secretAccessKey ?? config.secretAccessKey;

  // Allow either session token, authorization, or credentials
  const hasCredentials = accessKeyId && secretAccessKey;
  if (!sessionToken && !hasCredentials) {
    return {
      error: new Error('Session token or credentials are required'),
    };
  }

  if (!sessionToken && (!organizationId || organizationId === '')) {
    return { error: new Error('Organization ID is required') };
  }

  return createTigrisHttpClient({
    baseUrl: getStorageEndpoint(options),
    sessionToken,
    organizationId,
    accessKeyId,
    secretAccessKey,
  });
}
