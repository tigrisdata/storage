import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/styles.css'],
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  // React is a peer; the CLI browser build and just-bash are already
  // self-contained bundles, so leave them to the consumer's bundler.
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
