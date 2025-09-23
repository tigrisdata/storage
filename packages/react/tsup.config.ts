import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  globalName: 'TigrisReact',
  platform: 'browser',
  external: ['react', 'react-dom'],
  esbuildOptions: (options) => {
    options.loader = {
      ...options.loader,
      '.css': 'css',
      '.scss': 'css',
    };
  },
});