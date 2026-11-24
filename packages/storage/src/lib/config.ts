import {
  missingConfigError as baseMissingConfigError,
  getEnvVar,
  isNode,
} from '@shared/index';
import type { TigrisStorageConfig } from './types';

const configMap: Partial<Record<keyof TigrisStorageConfig, string>> = {
  endpoint: 'TIGRIS_STORAGE_ENDPOINT',
  bucket: 'TIGRIS_STORAGE_BUCKET',
  accessKeyId: 'TIGRIS_STORAGE_ACCESS_KEY_ID',
  secretAccessKey: 'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  sessionToken: 'TIGRIS_SESSION_TOKEN',
  organizationId: 'TIGRIS_ORGANIZATION_ID',
};

export const missingConfigError = (key: string) =>
  baseMissingConfigError(key, configMap[key as keyof TigrisStorageConfig]);

/**
 * Resolve the Tigris storage configuration from the environment, on demand.
 *
 * Reads only `TIGRIS_`-prefixed variables — from `process.env`, falling back to
 * a private parse of `.env` — and never mutates `process.env`. There is no
 * module-level config and importing this module has no side effects: each
 * operation calls `getConfig()` when it needs the current configuration.
 */
export function getConfig(): TigrisStorageConfig {
  const config: TigrisStorageConfig = {
    endpoint: 'https://t3.storage.dev',
  };

  if (isNode()) {
    config.bucket = getEnvVar('TIGRIS_STORAGE_BUCKET') ?? '';
    config.accessKeyId = getEnvVar('TIGRIS_STORAGE_ACCESS_KEY_ID') ?? '';
    config.secretAccessKey =
      getEnvVar('TIGRIS_STORAGE_SECRET_ACCESS_KEY') ?? '';
    config.endpoint =
      getEnvVar('TIGRIS_STORAGE_ENDPOINT') ?? 'https://t3.storage.dev';
    config.sessionToken = getEnvVar('TIGRIS_SESSION_TOKEN');
    config.organizationId = getEnvVar('TIGRIS_ORGANIZATION_ID');
  }

  return config;
}

/**
 * The session token of temporary credentials (STS `GetFederationToken`), when
 * the config carries them, or `undefined`.
 *
 * `sessionToken` is also how an OAuth access token is passed, so it only counts
 * as temporary credentials when it arrives with its key pair: `accessKeyId`,
 * `secretAccessKey` and `sessionToken` all in `options`, or all three in the
 * environment, where the token is `TIGRIS_STORAGE_SESSION_TOKEN`. A session
 * token on its own stays an OAuth token, as before.
 */
export function temporarySessionToken(
  options?: TigrisStorageConfig
): string | undefined {
  if (options?.sessionToken) {
    return options.accessKeyId && options.secretAccessKey
      ? options.sessionToken
      : undefined;
  }

  // A key pair from options was not issued with the environment's token.
  if (options?.accessKeyId || options?.secretAccessKey || !isNode()) {
    return undefined;
  }

  return getEnvVar('TIGRIS_STORAGE_SESSION_TOKEN') || undefined;
}
