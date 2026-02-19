#!/usr/bin/env node

// Binary entry point — uses static imports instead of dynamic import().
// For npm distribution, use src/cli.ts instead.

(globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY = true;

import { loadSpecs } from './specs-embedded.js';
import { setSpecs } from './utils/specs.js';
import { commandRegistry } from './command-registry.js';
import { checkForUpdates } from './utils/update-check.js';
import { version } from '../package.json';
import {
  setupErrorHandlers,
  createProgram,
  type ModuleLoader,
  type ImplementationChecker,
} from './cli-core.js';

// Pre-populate the shared specs cache so command modules work without filesystem access
const specs = loadSpecs();
setSpecs(specs);

setupErrorHandlers();

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

const program = createProgram({
  specs,
  version,
  loadModule,
  hasImplementation,
});

program.parse();
checkForUpdates();
