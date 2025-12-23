import {
  isNode,
  loadEnv,
  missingConfigError as baseMissingConfigError,
} from '@shared/index';
import type { TigrisStorageConfig } from './types';

const configMap: Record<keyof TigrisStorageConfig, string> = {
  endpoint: 'TIGRIS_STORAGE_ENDPOINT',
  bucket: 'TIGRIS_STORAGE_BUCKET',
  accessKeyId: 'TIGRIS_STORAGE_ACCESS_KEY_ID',
  secretAccessKey: 'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  sessionToken: 'TIGRIS_SESSION_TOKEN',
  organizationId: 'TIGRIS_ORGANIZATION_ID',
};

export const missingConfigError = (key: string) =>
  baseMissingConfigError(key, configMap[key as keyof TigrisStorageConfig]);

function loadStorageConfig(): TigrisStorageConfig {
  loadEnv();

  const config: TigrisStorageConfig = {
    endpoint: 'https://t3.storage.dev',
  };

  if (isNode()) {
    config.bucket = process.env.TIGRIS_STORAGE_BUCKET ?? '';
    config.accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '';
    config.secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '';
    config.endpoint =
      process.env.TIGRIS_STORAGE_ENDPOINT ?? 'https://t3.storage.dev';
    config.sessionToken = process.env.TIGRIS_SESSION_TOKEN;
    config.organizationId = process.env.TIGRIS_ORGANIZATION_ID;
  }

  return config;
}

export const config: TigrisStorageConfig = loadStorageConfig();
