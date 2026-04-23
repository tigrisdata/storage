import path from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      removeComments: false,
      paths: {
        '@shared/*': ['../../shared/*'],
      },
    },
  },
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  platform: 'neutral',
  esbuildOptions(options) {
    options.alias = {
      '@shared': path.resolve(__dirname, '../../shared'),
    };
  },
});
