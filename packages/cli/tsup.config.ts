import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/**/*.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
