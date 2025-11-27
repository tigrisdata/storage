import dotenv from 'dotenv';
import type { TigrisStorageConfig } from './types';

const configMap = {
  endpoint: 'TIGRIS_STORAGE_ENDPOINT',
  bucket: 'TIGRIS_STORAGE_BUCKET',
  accessKeyId: 'TIGRIS_STORAGE_ACCESS_KEY_ID',
  secretAccessKey: 'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  iamEndpoint: 'TIGRIS_STORAGE_IAM_ENDPOINT',
  authDomain: 'TIGRIS_AUTH_DOMAIN',
  sessionToken: 'TIGRIS_SESSION_TOKEN',
  organizationId: 'TIGRIS_ORGANIZATION_ID',
};

export const missingConfigError = (key: string) => ({
  error: new Error(
    `Tigris Storage Config incomplete: ${key} is missing. Please provide it in .env file or pass it as env variable as ${configMap[key as keyof typeof configMap]}
    or pass it as an option from method call. Checkout https://github.com/tigrisdata/storage/tree/main/packages/storage#configure-your-project for more details.`
  ),
});

function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.versions &&
    !!process.versions.node
  );
}

function loadEnvConfig(): TigrisStorageConfig {
  const config: TigrisStorageConfig = {
    endpoint: 'https://t3.storage.dev',
  };

  if (isNode()) {
    try {
      dotenv.config({ quiet: true });
    } catch {
      console.warn('Error loading .env file, switching to parameters');
    }

    config.bucket = process.env.TIGRIS_STORAGE_BUCKET ?? '';
    config.accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '';
    config.secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '';
    config.endpoint =
      process.env.TIGRIS_STORAGE_ENDPOINT ?? 'https://t3.storage.dev';
    config.iamEndpoint =
      process.env.TIGRIS_STORAGE_IAM_ENDPOINT ?? 'https://iam.storageapi.dev';
    config.authDomain = process.env.TIGRIS_AUTH_DOMAIN ?? 'auth.tigris.dev';
  }

  return config;
}

export const config: TigrisStorageConfig = loadEnvConfig();
