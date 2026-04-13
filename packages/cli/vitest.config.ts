import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load .env.test for integration tests
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  resolve: {
    alias: {
      '@auth': path.resolve(__dirname, 'src/auth'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    reporters: 'verbose',
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['test/setup.ts'],
    fileParallelism: false, // Run test files sequentially to avoid build race conditions
    env: {
      NODE_ENV: 'test',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
      ],
    },
  },
});
