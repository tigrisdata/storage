import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/server.ts'],
    format: ['esm', 'cjs'],
    dts: {
      compilerOptions: {
        removeComments: false,
      },
    },
    clean: false,
    splitting: false,
    sourcemap: false,
    minify: true,
    globalName: 'TigrisStorage',
    platform: 'neutral',
  },
  {
    entry: ['src/client.ts'],
    format: ['esm', 'cjs'],
    dts: {
      compilerOptions: {
        removeComments: false,
      },
    },
    clean: false,
    splitting: false,
    sourcemap: true,
    minify: true,
    globalName: 'TigrisStorageClient',
    platform: 'neutral',
  },
]);
