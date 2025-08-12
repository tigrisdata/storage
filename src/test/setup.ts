import { beforeAll, afterAll } from 'vitest';
import { remove } from '../lib/remove';
import { list } from '../lib/list';
import { config } from '../lib/config';

beforeAll(async () => {
  console.log('Setting up integration tests...');
  await cleanupTestFiles();
});

afterAll(async () => {
  console.log('Cleaning up after integration tests...');
  await cleanupTestFiles();
});

async function cleanupTestFiles() {
  try {
    const result = await list({ config });

    if (result.data?.items?.length) {
      const testFiles = result.data.items.filter((item) =>
        item.name.startsWith('test-')
      );

      if (testFiles.length > 0) {
        const deletePromises = testFiles.map((file) =>
          remove(file.name, { config })
        );
        await Promise.all(deletePromises);
        console.log(`Cleaned up ${testFiles.length} test files`);
      }
    }
  } catch (error) {
    console.warn('Cleanup failed:', error);
  }
}

export function shouldSkipIntegrationTests(): boolean {
  const requiredEnvVars = [
    'TIGRIS_STORAGE_BUCKET',
    'TIGRIS_STORAGE_ACCESS_KEY_ID',
    'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  ];

  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    console.warn(
      `Skipping integration tests - missing env vars: ${missing.join(', ')}`
    );
    console.warn('Set these environment variables to run integration tests');
    return true;
  }

  return false;
}
