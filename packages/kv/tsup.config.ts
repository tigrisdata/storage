import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: {
    compilerOptions: {
      paths: {
        '@shared/*': ['../../shared/*'],
      },
    },
  },
  clean: true,
  sourcemap: true,
  esbuildOptions(options) {
    options.alias = {
      '@shared': path.resolve(__dirname, '../../shared'),
    };
  },
});
