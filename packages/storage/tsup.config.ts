import { defineConfig } from 'tsup';
import path from 'path';

const sharedConfig = {
  esbuildOptions(options: { alias?: Record<string, string> }) {
    options.alias = {
      '@shared': path.resolve(__dirname, '../../shared'),
    };
  },
};

export default defineConfig([
  {
    entry: ['src/server.ts'],
    format: ['esm', 'cjs'],
    dts: {
      compilerOptions: {
        removeComments: false,
        paths: {
          '@shared/*': ['../../shared/*'],
        },
      },
    },
    clean: false,
    splitting: false,
    sourcemap: false,
    minify: true,
    globalName: 'TigrisStorage',
    platform: 'neutral',
    ...sharedConfig,
  },
  {
    entry: ['src/client.ts'],
    format: ['esm', 'cjs'],
    dts: {
      compilerOptions: {
        removeComments: false,
        paths: {
          '@shared/*': ['../../shared/*'],
        },
      },
    },
    clean: false,
    splitting: false,
    sourcemap: true,
    minify: true,
    globalName: 'TigrisStorageClient',
    platform: 'neutral',
    ...sharedConfig,
  },
]);
