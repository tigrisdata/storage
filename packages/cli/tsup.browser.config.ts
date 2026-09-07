import { defineConfig } from 'tsup';

/**
 * Types only. The browser JS bundle is built by `scripts/build-browser.ts`,
 * which drives esbuild directly — tsup marks Node builtins external before any
 * alias applies, and overriding that is the whole point of the browser build.
 */
export default defineConfig({
  entry: ['src/browser/index.ts'],
  outDir: 'dist/browser',
  format: ['esm'],
  dts: { only: true },
  clean: false,
});
