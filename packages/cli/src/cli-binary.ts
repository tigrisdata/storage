#!/usr/bin/env node

// Binary entry point — uses static imports instead of dynamic import().
// For npm distribution, use src/cli.ts instead.

(globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY = true;

import { version } from '../package.json';
import {
  createProgram,
  type ImplementationChecker,
  type ModuleLoader,
  setupErrorHandlers,
} from './cli-core.js';
import { commandRegistry } from './command-registry.js';
import { loadSpecs } from './specs-embedded.js';
import { setSpecs } from './utils/specs.js';
import {
  runTelemetrySender,
  TELEMETRY_SEND_COMMAND,
} from './utils/telemetry-sender.js';
import { checkForUpdates } from './utils/update-check.js';

/**
 * Check if a command has an implementation (registry-based)
 */
const hasImplementation: ImplementationChecker = (commandPath) => {
  const key = commandPath.join('/');
  return key in commandRegistry;
};

/**
 * Load module from static registry (for binary distribution)
 */
const loadModule: ModuleLoader = async (commandPath) => {
  const key = commandPath.join('/');
  const module = commandRegistry[key];

  if (module) {
    return { module, error: null };
  }

  return { module: null, error: `Command not found: ${commandPath.join(' ')}` };
};

// Internal: the detached telemetry sender (see utils/telemetry-sender.ts).
// Handled before anything else so it never initializes telemetry itself.
if (process.argv[2] === TELEMETRY_SEND_COMMAND) {
  void runTelemetrySender(process.argv[3]).finally(() => process.exit(0));
} else {
  // Pre-populate the shared specs cache so command modules work without filesystem access
  const specs = loadSpecs();
  setSpecs(specs);

  setupErrorHandlers();

  const program = createProgram({
    specs,
    version,
    loadModule,
    hasImplementation,
  });

  program.parse();
  checkForUpdates();
}
