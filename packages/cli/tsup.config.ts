import { defineConfig } from 'tsup';
import { copyFileSync, watch } from 'fs';
import { join } from 'path';

const copySpecs = () => {
  copyFileSync(
    join(process.cwd(), 'src/specs.yaml'),
    join(process.cwd(), 'dist/specs.yaml')
  );
};

export default defineConfig((options) => ({
  entry: ['src/cli.ts', 'src/**/*.ts'],
  format: ['esm'],
  dts: false,
  splitting: true,
  sourcemap: false,
  clean: true,
  minify: true,
  onSuccess: async () => {
    copySpecs();

    // In watch mode, also watch specs.yaml for changes
    if (options.watch) {
      watch(join(process.cwd(), 'src/specs.yaml'), (eventType) => {
        if (eventType === 'change') {
          console.log('specs.yaml changed, copying...');
          copySpecs();
        }
      });
    }
  },
}));
