import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from '../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['./*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
      exclude: ['node_modules', 'dist'],
    },
  })
);
