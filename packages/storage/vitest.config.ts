import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: ['node_modules', 'dist'],
      setupFiles: ['src/test/setup.ts'],
      // Live-gateway integration tests poll eventually-consistent state, so they
      // need a longer ceiling than the 30s base default. Configure it once here
      // instead of overriding per-test.
      testTimeout: 60_000,
      hookTimeout: 60_000,
      // Integration tests run against a live, eventually-consistent gateway,
      // so a transient read-after-write/delete race or a slow request can fail
      // an otherwise-correct assertion. Retry to absorb those flakes instead of
      // failing (and manually re-running) the whole CI job. Deterministic unit
      // failures still fail every attempt, so they are not masked.
      retry: 2,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'dist/',
          '**/*.{test,spec}.{js,ts}',
          'src/test/',
        ],
      },
    },
  })
);
