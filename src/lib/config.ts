export interface Config {
  tigrisStorageBucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.versions &&
    !!process.versions.node
  );
}

function loadEnvConfig(): Config {
  const config: Config = {
    tigrisStorageBucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    endpoint: 'https://t3.storage.dev',
  };

  if (isNode()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dotenv = require('dotenv');
      dotenv.config();

      config.tigrisStorageBucket = process.env.TIGRIS_STORAGE_BUCKET ?? '';
      config.accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '';
      config.secretAccessKey =
        process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '';
      config.endpoint =
        process.env.TIGRIS_STORAGE_ENDPOINT_URL ?? 'https://t3.storage.dev';
    } catch (error) {
      config.tigrisStorageBucket = process.env.TIGRIS_STORAGE_BUCKET ?? '';
      config.accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '';
      config.secretAccessKey =
        process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '';
      config.endpoint =
        process.env.TIGRIS_STORAGE_ENDPOINT_URL ?? 'https://t3.storage.dev';
    }
  }

  return config;
}

export const config: Config = loadEnvConfig();
