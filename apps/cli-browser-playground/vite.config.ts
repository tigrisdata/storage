import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Convenience for local testing only: pull credentials from the repo-root
  // .env so the form comes pre-filled. Dev server only — never in a build,
  // and this app is private and never published.
  const rootEnv =
    mode === 'development' ? loadEnv(mode, '../..', 'TIGRIS_') : {};

  return {
    define: {
      __PREFILL__: JSON.stringify({
        accessKeyId: rootEnv.TIGRIS_STORAGE_ACCESS_KEY_ID ?? '',
        secretAccessKey: rootEnv.TIGRIS_STORAGE_SECRET_ACCESS_KEY ?? '',
        bucket: rootEnv.TIGRIS_STORAGE_BUCKET ?? '',
      }),
    },
  };
});
