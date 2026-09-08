import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT, 10) : 3000,
  },
  plugins: [
    react(),
    {
      // Vite dev serves cli/index.html only at `/cli/`; a bare `/cli` falls
      // back to the root page. Go's static server (prod) already redirects
      // `/cli` to `/cli/`, so rewrite here to match and keep one clean URL.
      name: 'cli-trailing-slash',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/cli') req.url = '/cli/';
          next();
        });
      },
    },
  ],
  // The Tigris CLI shell at /cli reads its tenant and endpoints from the
  // repo-root .env. Expose exactly those keys: the same file holds access
  // keys, and anything matched here is compiled into the client bundle.
  envDir: new URL('../..', import.meta.url).pathname,
  envPrefix: [
    'VITE_',
    'TIGRIS_AUTH0_',
    'TIGRIS_CLAIMS_NAMESPACE',
    'TIGRIS_STORAGE_ENDPOINT',
    'TIGRIS_IAM_ENDPOINT',
    'TIGRIS_MGMT_ENDPOINT',
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Two pages: the agent shell at / and the Tigris CLI shell at /cli.
      input: {
        main: 'index.html',
        cli: 'cli/index.html',
      },
    },
  },
  resolve: {
    alias: {
      // Stub node:zlib — the just-bash browser bundle references gunzipSync
      // for gzip support, which neither shell needs in the playground.
      'node:zlib': new URL('./src/stubs/zlib.ts', import.meta.url).pathname,
    },
  },
});
