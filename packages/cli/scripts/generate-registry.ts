#!/usr/bin/env tsx

/**
 * Auto-generate command-registry.ts from specs.yaml.
 *
 * specs.yaml is the single source of truth for command structure.
 * This script generates static imports for commands that have implementations.
 *
 * Run: npm run generate:registry
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as YAML from 'yaml';

const ROOT = process.cwd();
const SPECS_PATH = join(ROOT, 'src/specs.yaml');
const OUTPUT_PATH = join(ROOT, 'src/command-registry.ts');

interface CommandSpec {
  name: string;
  alias?: string;
  commands?: CommandSpec[];
  default?: string;
}

interface Specs {
  commands: CommandSpec[];
}

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

  // Check for direct file: src/lib/{path}.ts
  const directPath = `${basePath}.ts`;
  if (existsSync(directPath)) {
    return `./lib/${commandPath.join('/')}.js`;
  }

  // Check for index file: src/lib/{path}/index.ts
  const indexPath = join(basePath, 'index.ts');
  if (existsSync(indexPath)) {
    return `./lib/${commandPath.join('/')}/index.js`;
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
    const currentPath = [...parentPath, cmd.name];

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
// Run: npm run generate:registry

${imports}

export const commandRegistry: Record<string, Record<string, unknown>> = {
${registryEntries}
};
`;
}

// Main
const specsContent = readFileSync(SPECS_PATH, 'utf8');
const specs: Specs = YAML.parse(specsContent, { schema: 'core' });

const entries = collectEntries(specs.commands);

console.log(`Found ${entries.length} command implementations:`);
entries.forEach((e) => console.log(`  ${e.key}`));

const output = generateRegistry(entries);
writeFileSync(OUTPUT_PATH, output);

console.log(`\nGenerated: ${OUTPUT_PATH}`);
