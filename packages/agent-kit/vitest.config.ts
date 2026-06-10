import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: ['node_modules', 'dist'],
      setupFiles: ['test/setup.ts'],
      // Integration tests run against a live, eventually-consistent gateway,
      // so a transient read-after-write/delete race or a slow request can fail
      // an otherwise-correct assertion. Retry to absorb those flakes instead of
      // failing (and manually re-running) the whole CI job.
      retry: 2,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['node_modules/', 'dist/', '**/*.{test,spec}.{js,ts}'],
      },
    },
  })
);
