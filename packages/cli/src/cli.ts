#!/usr/bin/env node

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadSpecs } from './utils/specs.js';
import { checkForUpdates } from './utils/update-check.js';
import { version } from '../package.json';
import {
  setupErrorHandlers,
  createProgram,
  type ModuleLoader,
  type ImplementationChecker,
} from './cli-core.js';

setupErrorHandlers();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const specs = loadSpecs();

/**
 * Check if a command path has an implementation (filesystem-based)
 */
const hasImplementation: ImplementationChecker = (pathParts) => {
  if (pathParts.length === 0) return false;

  const directPath = join(__dirname, 'lib', ...pathParts) + '.js';
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

const program = createProgram({
  specs,
  version,
  loadModule,
  hasImplementation,
});

program.parse();
checkForUpdates();
