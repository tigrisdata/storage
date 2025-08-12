import { TigrisStorageConfig } from './types';

const configMap = {
  endpoint: 'TIGRIS_STORAGE_ENDPOINT',
  bucket: 'TIGRIS_STORAGE_BUCKET',
  accessKeyId: 'TIGRIS_STORAGE_ACCESS_KEY_ID',
  secretAccessKey: 'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
};

export const missingConfigError = (key: string) => ({
  error: new Error(
    `Tigris Storage Config incomplete: ${key} is missing.\n
    Please provide it in .env file or pass it as env variable as ${configMap[key as keyof typeof configMap]}, 
    or pass it as an option from method call.\n
    Checkout https://github.com/tigrisdata/storage#configuration for more details.`
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dotenv = require('dotenv');
      dotenv.config({ quiet: process.env.NODE_ENV === 'production' });
    } catch {
      console.warn('Error loading .env file, switching to parameters');
    }

    config.bucket = process.env.TIGRIS_STORAGE_BUCKET ?? '';
    config.accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '';
    config.secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '';
    config.endpoint =
      process.env.TIGRIS_STORAGE_ENDPOINT ?? 'https://t3.storage.dev';
  }

  return config;
}

export const config: TigrisStorageConfig = loadEnvConfig();
