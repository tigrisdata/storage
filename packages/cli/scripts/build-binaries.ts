#!/usr/bin/env tsx

/**
 * Build standalone binaries for all supported platforms using `bun build --compile`.
 *
 * Usage:
 *   npx tsx scripts/build-binaries.ts          # build all targets
 *   npx tsx scripts/build-binaries.ts linux-x64 # build one target
 */

import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

const ENTRY = 'src/cli-binary.ts';
const OUT_DIR = join(process.cwd(), 'bin');

const targets: Record<string, { bunTarget: string; outName: string }> = {
  'darwin-arm64': {
    bunTarget: 'bun-darwin-arm64',
    outName: 'tigris-darwin-arm64',
  },
  'darwin-x64': {
    bunTarget: 'bun-darwin-x64',
    outName: 'tigris-darwin-x64',
  },
  'linux-x64': {
    bunTarget: 'bun-linux-x64',
    outName: 'tigris-linux-x64',
  },
  'linux-arm64': {
    bunTarget: 'bun-linux-arm64',
    outName: 'tigris-linux-arm64',
  },
  'windows-x64': {
    bunTarget: 'bun-windows-x64',
    outName: 'tigris-windows-x64.exe',
  },
};

// Allow filtering to specific targets via CLI args
const requestedTargets = process.argv.slice(2);
const selectedTargets =
  requestedTargets.length > 0
    ? Object.fromEntries(
        Object.entries(targets).filter(([key]) =>
          requestedTargets.includes(key)
        )
      )
    : targets;

if (Object.keys(selectedTargets).length === 0) {
  console.error(
    `No matching targets. Available: ${Object.keys(targets).join(', ')}`
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, { bunTarget, outName }] of Object.entries(selectedTargets)) {
  const outFile = join(OUT_DIR, outName);
  const cmd = `bun build ${ENTRY} --compile --target=${bunTarget} --outfile=${outFile}`;
  console.log(`\n[${name}] ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`[${name}] ✓ ${outFile}`);
  } catch {
    console.error(`[${name}] ✗ build failed`);
    process.exit(1);
  }
}

console.log('\nAll builds complete.');
