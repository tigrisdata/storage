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
