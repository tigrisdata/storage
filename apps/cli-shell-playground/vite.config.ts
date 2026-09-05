import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Local testing convenience: pre-fill the access key from the repo-root .env
  // so the demo is one click. Dev server only; this app is never published.
  const rootEnv =
    mode === 'development' ? loadEnv(mode, '../..', 'TIGRIS_') : {};

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // just-bash's browser bundle references node:zlib for gzip/gunzip/zcat.
        // Nothing else needs it, so a throwing stub is the whole cost of
        // running a virtual bash in the browser.
        'node:zlib': new URL('./src/stubs/zlib.ts', import.meta.url).pathname,
      },
    },
    define: {
      __PREFILL__: JSON.stringify({
        accessKeyId: rootEnv.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '',
        secretAccessKey: rootEnv.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '',
      }),
    },
  };
});
