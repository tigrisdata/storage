#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { version } from '../package.json';
import type { ImplementationChecker, ModuleLoader } from './cli-core.js';
import {
  runTelemetrySender,
  TELEMETRY_SEND_COMMAND,
} from './utils/telemetry-sender.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if a command path has an implementation (filesystem-based)
 */
const hasImplementation: ImplementationChecker = (pathParts) => {
  if (pathParts.length === 0) return false;

  const directPath = `${join(__dirname, 'lib', ...pathParts)}.js`;
  if (existsSync(directPath)) return true;

  const indexPath = join(__dirname, 'lib', ...pathParts, 'index.js');
  if (existsSync(indexPath)) return true;

  return false;
};

/**
 * Load module dynamically (for npm distribution)
 */
const loadModule: ModuleLoader = async (pathParts) => {
  const paths = [
    `./lib/${pathParts.join('/')}.js`,
    `./lib/${pathParts.join('/')}/index.js`,
  ];

  for (const path of paths) {
    const module = await import(path).catch(() => null);
    if (module) {
      return { module, error: null };
    }
  }

  const cmdDisplay = pathParts.join(' ');
  return { module: null, error: `Command not found: ${cmdDisplay}` };
};

async function main(): Promise<void> {
  const [{ createProgram, setupErrorHandlers }, { loadSpecs }, updates] =
    await Promise.all([
      import('./cli-core.js'),
      import('./utils/specs.js'),
      import('./utils/update-check.js'),
    ]);

  setupErrorHandlers();

  const program = createProgram({
    specs: loadSpecs(),
    version,
    loadModule,
    hasImplementation,
  });

  program.parse();
  updates.checkForUpdates();
}

// Internal: the detached telemetry sender (see utils/telemetry-sender.ts).
// Checked before the CLI itself is loaded, so the sender starts quickly and
// never initializes telemetry of its own.
if (process.argv[2] === TELEMETRY_SEND_COMMAND) {
  void runTelemetrySender(process.argv[3]).finally(() => process.exit(0));
} else {
  void main();
}
