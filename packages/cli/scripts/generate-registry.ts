#!/usr/bin/env tsx

/**
 * Auto-generate command-registry.ts from specs.yaml.
 *
 * specs.yaml is the single source of truth for command structure.
 * This script generates static imports for commands that have implementations.
 *
 * Run: npm run generate:registry
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as YAML from 'yaml';

import type { CommandSpec, Specs } from '../src/types.js';

const ROOT = process.cwd();
const SPECS_PATH = join(ROOT, 'src/specs.yaml');

/**
 * Commands the browser build cannot serve. Everything else in specs.yaml is
 * included automatically, so new commands reach the browser for free.
 */
const BROWSER_EXCLUDED = new Set([
  // Machine-local: spawns processes, writes editor config, probes PATH.
  'update',
  'init',
  // Telemetry is stubbed off in the browser build.
  'telemetry/status',
  'telemetry/enable',
  'telemetry/disable',
  // Streams a tar of objects to stdout as binary, which has no browser analogue.
  'bundle',
]);

type Target = 'binary' | 'browser';

const TARGETS: Record<
  Target,
  { output: string; exportName: string; excluded: Set<string> }
> = {
  binary: {
    output: join(ROOT, 'src/command-registry.ts'),
    exportName: 'commandRegistry',
    excluded: new Set(),
  },
  browser: {
    output: join(ROOT, 'src/browser/command-registry.generated.ts'),
    exportName: 'browserCommandRegistry',
    excluded: BROWSER_EXCLUDED,
  },
};

const target: Target = process.argv.includes('--target=browser')
  ? 'browser'
  : 'binary';
const {
  output: OUTPUT_PATH,
  exportName: EXPORT_NAME,
  excluded: EXCLUDED,
} = TARGETS[target];

interface RegistryEntry {
  key: string;
  importName: string;
  importPath: string;
}

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Find the implementation file for a command path
 */
function findImplementationPath(commandPath: string[]): string | null {
  const basePath = join(ROOT, 'src/lib', ...commandPath);
  // The browser registry lives one directory deeper than the binary one.
  const prefix = target === 'browser' ? '../lib' : './lib';

  // Check for direct file: src/lib/{path}.ts
  const directPath = `${basePath}.ts`;
  if (existsSync(directPath)) {
    return `${prefix}/${commandPath.join('/')}.js`;
  }

  // Check for index file: src/lib/{path}/index.ts
  const indexPath = join(basePath, 'index.ts');
  if (existsSync(indexPath)) {
    return `${prefix}/${commandPath.join('/')}/index.js`;
  }

  return null;
}

/**
 * Generate import name from command path
 * e.g., ["buckets", "list"] -> "bucketsList"
 * e.g., ["iam", "policies", "create"] -> "iamPoliciesCreate"
 */
function toImportName(path: string[]): string {
  return path
    .map((part, index) => {
      const camel = toCamelCase(part);
      return index === 0
        ? camel
        : camel.charAt(0).toUpperCase() + camel.slice(1);
    })
    .join('');
}

/**
 * Recursively collect all registry entries from the command tree
 */
function collectEntries(
  commands: CommandSpec[],
  parentPath: string[] = []
): RegistryEntry[] {
  const entries: RegistryEntry[] = [];

  for (const cmd of commands) {
    // Removed commands have no implementation file by design — the
    // cli-core intercepts them and prints a redirect message.
    if (cmd.removed) continue;

    const currentPath = [...parentPath, cmd.name];

    // Excluding a parent excludes its whole subtree (e.g. `init`).
    if (EXCLUDED.has(currentPath.join('/'))) continue;

    if (cmd.commands && cmd.commands.length > 0) {
      // Has sub-commands - recurse into them
      entries.push(...collectEntries(cmd.commands, currentPath));
    } else {
      // Leaf command - check if implementation exists
      const implPath = findImplementationPath(currentPath);
      if (implPath) {
        entries.push({
          key: currentPath.join('/'),
          importName: toImportName(currentPath),
          importPath: implPath,
        });
      }
    }
  }

  return entries;
}

/**
 * Generate the command-registry.ts file content
 */
function generateRegistry(entries: RegistryEntry[]): string {
  const imports = entries
    .map((e) => `import * as ${e.importName} from '${e.importPath}';`)
    .join('\n');

  const registryEntries = entries
    .map((e) => `  '${e.key}': ${e.importName},`)
    .join('\n');

  return `// Auto-generated from specs.yaml - DO NOT EDIT
// Run: npm run generate:registry${target === 'browser' ? ':browser' : ''}

${imports}

export const ${EXPORT_NAME}: Record<string, Record<string, unknown>> = {
${registryEntries}
};
`;
}

// Main
const specsContent = readFileSync(SPECS_PATH, 'utf8');
const specs: Specs = YAML.parse(specsContent, { schema: 'core' });

const entries = collectEntries(specs.commands);

console.log(`[${target}] Found ${entries.length} command implementations:`);
entries.forEach((e) => {
  console.log(`  ${e.key}`);
});

const output = generateRegistry(entries);
writeFileSync(OUTPUT_PATH, output);

console.log(`\nGenerated: ${OUTPUT_PATH}`);
