import { defineConfig } from 'tsup';
import path from 'node:path';

export default defineConfig({
  entry: ['src/index.ts', 'src/styles.css'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  external: ['react', 'react-dom'],
  esbuildOptions(options) {
    options.alias = {
      '@shared': path.resolve(__dirname, '../../shared'),
    };
  },
});
