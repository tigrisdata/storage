import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from the ai package root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export function shouldSkipIntegrationTests(): boolean {
  const requiredEnvVars = [
    'TIGRIS_STORAGE_ACCESS_KEY_ID',
    'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  ];

  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    console.warn(
      `Skipping integration tests - missing env vars: ${missing.join(', ')}`
    );
    return true;
  }

  return false;
}
