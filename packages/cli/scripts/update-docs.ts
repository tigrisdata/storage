import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';

import type { CommandSpec } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const libDir = join(__dirname, '..', 'src', 'lib');

interface Specs {
  name: string;
  description: string;
  version: string;
  commands: CommandSpec[];
}

function isImplemented(...parts: string[]): boolean {
  const base = join(libDir, ...parts);
  const paths = [base + '.ts', join(base, 'index.ts')];
  return paths.some((p) => existsSync(p) && !p.includes('/_'));
}

function hasImplementation(
  cmd: CommandSpec,
  ...parentParts: string[]
): boolean {
  if (cmd.removed) return false;
  const parts = [...parentParts, cmd.name];
  if (isImplemented(...parts)) return true;
  if (cmd.commands) {
    return cmd.commands.some((sub) => hasImplementation(sub, ...parts));
  }
  return false;
}

function aliasList(cmd: CommandSpec): string[] {
  if (!cmd.alias) return [];
  return Array.isArray(cmd.alias) ? cmd.alias : [cmd.alias];
}

function aliasSuffix(cmd: CommandSpec): string {
  const aliases = aliasList(cmd);
  return aliases.length ? ` (${aliases.join(', ')})` : '';
}

function getPositionalSuffix(cmd: CommandSpec): string {
  const positionals = (cmd.arguments ?? [])
    .filter((a) => a.type === 'positional' && !a.removed)
    .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`));
  return positionals.length ? ' ' + positionals.join(' ') : '';
}

function renderCommandTable(
  commands: CommandSpec[],
  parentPath: string[]
): string[] {
  const lines: string[] = [];
  lines.push('| Command | Description |');
  lines.push('|---------|-------------|');
  for (const cmd of commands) {
    const fullName = [...parentPath, cmd.name].join(' ');
    lines.push(
      `| \`tigris ${fullName}\`${aliasSuffix(cmd)} | ${cmd.description ?? ''} |`
    );
  }
  lines.push('');
  return lines;
}

function renderLeafDetail(cmd: CommandSpec, parentPath: string[]): string[] {
  const lines: string[] = [];
  const fullName = [...parentPath, cmd.name].join(' ');
  const positionals = getPositionalSuffix(cmd);
  const flags = (cmd.arguments ?? []).filter(
    (a) => a.type !== 'positional' && !a.removed
  );

  lines.push('```');
  lines.push(
    `tigris ${fullName}${positionals}${flags.length ? ' [flags]' : ''}`
  );
  lines.push('```');
  lines.push('');

  if (flags.length > 0) {
    lines.push('| Flag | Description |');
    lines.push('|------|-------------|');
    for (const arg of flags) {
      const flagName = arg.alias
        ? `-${arg.alias}, --${arg.name}`
        : `--${arg.name}`;
      const defaultStr =
        arg.default !== undefined ? ` (default: ${arg.default})` : '';
      lines.push(`| \`${flagName}\` | ${arg.description ?? ''}${defaultStr} |`);
    }
    lines.push('');
  }

  if (cmd.examples && cmd.examples.length > 0) {
    lines.push('**Examples:**');
    lines.push('```bash');
    for (const ex of cmd.examples) lines.push(ex);
    lines.push('```');
    lines.push('');
  }

  return lines;
}

function renderCommand(
  cmd: CommandSpec,
  parentPath: string[],
  level: number
): string {
  const lines: string[] = [];
  const fullName = [...parentPath, cmd.name].join(' ');
  const hash = '#'.repeat(Math.min(level, 6));

  lines.push(`${hash} \`tigris ${fullName}\`${aliasSuffix(cmd)}`);
  lines.push('');
  if (cmd.description) {
    lines.push(cmd.description);
    lines.push('');
  }

  const childPath = [...parentPath, cmd.name];
  const subcommands = (cmd.commands ?? []).filter((sub) =>
    hasImplementation(sub, ...childPath)
  );

  if (subcommands.length === 0) {
    lines.push(...renderLeafDetail(cmd, parentPath));
    return lines.join('\n');
  }

  lines.push(...renderCommandTable(subcommands, childPath));
  for (const sub of subcommands) {
    lines.push(renderCommand(sub, childPath, level + 1));
  }
  return lines.join('\n');
}

function generateDocs(specs: Specs): string {
  const lines: string[] = [];

  lines.push('## Usage');
  lines.push('');
  lines.push('```');
  lines.push('tigris <command> [flags]');
  lines.push('```');
  lines.push('');
  lines.push(
    'Run `tigris help` to see all available commands, or `tigris <command> help` for details on a specific command.'
  );
  lines.push('');

  const topLevel = specs.commands.filter((c) => hasImplementation(c));

  lines.push('### Commands');
  lines.push('');
  lines.push(...renderCommandTable(topLevel, []));
  lines.push('---');
  lines.push('');

  for (const cmd of topLevel) {
    lines.push(renderCommand(cmd, [], 3));
  }

  return lines.join('\n');
}

function updateReadme(docsContent: string): void {
  const readmePath = join(__dirname, '..', 'README.md');
  const readmeContent = readFileSync(readmePath, 'utf-8');

  const usageStart = readmeContent.indexOf('## Usage');
  const licenseStart = readmeContent.indexOf('## License');

  if (usageStart === -1 || licenseStart === -1) {
    console.error('Could not find ## Usage or ## License section in README.md');
    process.exit(1);
  }

  const newReadme =
    readmeContent.slice(0, usageStart) +
    docsContent +
    '\n' +
    readmeContent.slice(licenseStart);

  writeFileSync(readmePath, newReadme);
  console.log('README.md updated successfully!');
}

const specsPath = join(__dirname, '..', 'src', 'specs.yaml');
const specsContent = readFileSync(specsPath, 'utf-8');
const specs = yaml.parse(specsContent) as Specs;

const docs = generateDocs(specs);
updateReadme(docs);
