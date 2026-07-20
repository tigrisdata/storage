import { getEnvVar } from '@shared/index';
import { afterAll, beforeAll } from 'vitest';
import { getConfig } from '../lib/config';
import { list } from '../lib/object/list';
import { remove } from '../lib/object/remove';

beforeAll(async () => {
  console.log('Setting up integration tests...');
  await cleanupTestFiles();
});

afterAll(async () => {
  console.log('Cleaning up after integration tests...');
  await cleanupTestFiles();
});

async function cleanupTestFiles() {
  const config = getConfig();
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

  // Resolve through the SDK's own env resolution (process.env + private .env),
  // so the skip decision matches what getConfig() will actually resolve.
  const missing = requiredEnvVars.filter((envVar) => !getEnvVar(envVar));

  if (missing.length > 0) {
    console.warn(
      `Skipping integration tests - missing env vars: ${missing.join(', ')}`
    );
    console.warn('Set these environment variables to run integration tests');
    return true;
  }

  return false;
}

// The fork merge/rebase suite creates multiple buckets (with snapshots), forks
// one off another, and waits out eventual consistency, which adds noticeable
// time to the pipeline. Keep it out of the default run to keep the pipeline
// short; opt in explicitly with RUN_FORK_INTEGRATION_TESTS=true (it still needs
// the integration env vars).
export function shouldSkipForkTests(): boolean {
  if (shouldSkipIntegrationTests()) {
    return true;
  }

  if (getEnvVar('RUN_FORK_INTEGRATION_TESTS') !== 'true') {
    console.warn(
      'Skipping fork merge/rebase integration tests - set ' +
        'RUN_FORK_INTEGRATION_TESTS=true to run them'
    );
    return true;
  }

  return false;
}
