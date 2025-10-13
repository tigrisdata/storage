import { defineConfig } from 'tsup';
import { copyFileSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  entry: ['src/cli.ts', 'src/**/*.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  onSuccess: async () => {
    copyFileSync(
      join(process.cwd(), 'src/specs.yaml'),
      join(process.cwd(), 'dist/specs.yaml')
    );
  },
});
