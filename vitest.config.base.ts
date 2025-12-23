import { defineConfig } from 'vitest/config';
import path from 'node:path';
import dotenv from 'dotenv';

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '.env') });

export const baseConfig = defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
