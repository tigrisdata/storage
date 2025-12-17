import { beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const distPath = path.resolve(process.cwd(), 'dist/cli.js');

// Build once before running tests (only if dist doesn't exist)
beforeAll(async () => {
  if (!existsSync(distPath)) {
    console.log('Building CLI before tests...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch {
      console.error('Build failed');
      throw new Error('Build failed');
    }
  }
});

afterAll(async () => {
  console.log('Tests completed');
});

export function shouldSkipIntegrationTests(): boolean {
  // Check if we have credentials from .env (access keys) - this is the primary method for tests
  const hasAccessKeys =
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID &&
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY;

  if (!hasAccessKeys) {
    console.warn(
      'Skipping integration tests - no credentials found. Set TIGRIS_STORAGE_ACCESS_KEY_ID and TIGRIS_STORAGE_SECRET_ACCESS_KEY in .env'
    );
    return true;
  }

  return false;
}

/**
 * Generate a unique test prefix using nanosecond timestamp
 * Format: tigris-cli-test-{timestamp}
 */
export function getTestPrefix(): string {
  const timestamp = process.hrtime.bigint().toString();
  return `tigris-cli-test-${timestamp}`;
}

/**
 * Get a unique test bucket name
 */
export function getTestBucket(prefix?: string): string {
  const pfx = prefix || getTestPrefix();
  return pfx;
}
