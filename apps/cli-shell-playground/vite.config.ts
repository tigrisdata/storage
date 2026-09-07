import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // `PORT=3456 pnpm dev` to run alongside something else on 3000.
    port: Number(process.env.PORT) || 3000,
  },
  resolve: {
    alias: {
      // just-bash's browser bundle references node:zlib for gzip/gunzip/zcat.
      // Nothing else needs it, so a throwing stub is the whole cost of
      // running a virtual bash in the browser.
      'node:zlib': new URL('./src/stubs/zlib.ts', import.meta.url).pathname,
    },
  },
});
