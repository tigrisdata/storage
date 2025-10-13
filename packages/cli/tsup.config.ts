import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/**/*.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: true,
  publicDir: 'src',
});
