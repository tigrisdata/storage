import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';
import type { OperationSpec, CommandSpec } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const libDir = join(__dirname, '..', 'src', 'lib');

interface Specs {
  name: string;
  description: string;
  version: string;
  commands: CommandSpec[];
}

// Check if a command is implemented (has a corresponding .ts file without underscore prefix)
function isImplemented(cmdName: string, opName?: string): boolean {
  const paths = opName
    ? [join(libDir, cmdName, `${opName}.ts`), join(libDir, cmdName, opName, 'index.ts')]
    : [join(libDir, `${cmdName}.ts`), join(libDir, cmdName, 'index.ts')];

  return paths.some((p) => existsSync(p) && !p.includes('/_'));
}

function getCommandUsage(cmd: CommandSpec): string {
  if (!cmd.arguments) return `tigris ${cmd.name}`;

  const positionals = cmd.arguments
    .filter((a) => a.type === 'positional')
    .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`));

  return `tigris ${cmd.name}${positionals.length ? ' ' + positionals.join(' ') : ''}`;
}

function generateCommandSection(cmd: CommandSpec): string {
  const lines: string[] = [];
  const aliasStr = cmd.alias ? ` | \`${cmd.alias}\`` : '';

  lines.push(`### \`${cmd.name}\`${aliasStr}`);
  lines.push('');
  lines.push(cmd.description);
  lines.push('');
  lines.push('```');
  const usage = getCommandUsage(cmd);
  const hasFlags = cmd.arguments?.some((a) => a.type !== 'positional');
  lines.push(`${usage}${hasFlags ? ' [flags]' : ''}`);
  lines.push('```');
  lines.push('');

  const flags = cmd.arguments?.filter((a) => a.type !== 'positional') || [];
  if (flags.length > 0) {
    lines.push('| Flag | Description |');
    lines.push('|------|-------------|');
    for (const arg of flags) {
      const flagName = arg.alias ? `-${arg.alias}, --${arg.name}` : `--${arg.name}`;
      lines.push(`| \`${flagName}\` | ${arg.description} |`);
    }
    lines.push('');
  }

  const positionals = cmd.arguments?.filter((a) => a.type === 'positional') || [];
  if (positionals.length > 0 && positionals.some((p) => p.examples?.length)) {
    lines.push('**Examples:**');
    lines.push('```bash');
    if (positionals.length === 1 && positionals[0].examples) {
      for (const ex of positionals[0].examples.slice(0, 3)) {
        lines.push(`tigris ${cmd.name} ${ex}`);
      }
    } else if (positionals.length >= 2) {
      if (cmd.name === 'cp' || cmd.name === 'mv') {
        lines.push(`tigris ${cmd.name} bucket/file.txt bucket/copy.txt`);
        lines.push(`tigris ${cmd.name} bucket/folder/ other-bucket/folder/`);
      }
    }
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function generateResourceSection(cmd: CommandSpec, headerLevel: string = '###'): string {
  const lines: string[] = [];
  const aliasStr = cmd.alias ? ` | \`${cmd.alias}\`` : '';
  const subHeaderLevel = headerLevel === '###' ? '####' : '#####';

  lines.push(`${headerLevel} \`${cmd.name}\`${aliasStr}`);
  lines.push('');
  lines.push(cmd.description);
  lines.push('');

  const implementedOps = cmd.operations?.filter((op) => isImplemented(cmd.name, op.name)) || [];

  if (implementedOps.length > 0) {
    lines.push('| Command | Description |');
    lines.push('|---------|-------------|');
    for (const op of implementedOps) {
      const opAlias = op.alias
        ? ` (${Array.isArray(op.alias) ? op.alias[0] : op.alias})`
        : '';
      lines.push(`| \`${cmd.name} ${op.name}\`${opAlias} | ${op.description} |`);
    }
    lines.push('');

    for (const op of implementedOps) {
      lines.push(generateOperationSection(cmd.name, op, subHeaderLevel));
    }
  }

  return lines.join('\n');
}

function generateOperationSection(parentName: string, op: OperationSpec, headerLevel: string = '####'): string {
  const lines: string[] = [];

  lines.push(`${headerLevel} \`${parentName} ${op.name}\``);
  lines.push('');

  const positionals =
    op.arguments
      ?.filter((a) => a.type === 'positional')
      .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)) || [];

  const hasFlags = op.arguments?.some((a) => a.type !== 'positional');

  lines.push('```');
  lines.push(
    `tigris ${parentName} ${op.name}${positionals.length ? ' ' + positionals.join(' ') : ''}${hasFlags ? ' [flags]' : ''}`
  );
  lines.push('```');
  lines.push('');

  const flags = op.arguments?.filter((a) => a.type !== 'positional') || [];
  if (flags.length > 0) {
    lines.push('| Flag | Description |');
    lines.push('|------|-------------|');
    for (const arg of flags) {
      const flagName = arg.alias ? `-${arg.alias}, --${arg.name}` : `--${arg.name}`;
      const defaultStr = arg.default !== undefined ? ` (default: ${arg.default})` : '';
      lines.push(`| \`${flagName}\` | ${arg.description}${defaultStr} |`);
    }
    lines.push('');
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
  lines.push('Run `tigris help` to see all available commands, or `tigris <command> help` for details on a specific command.');
  lines.push('');

  // Core commands (Unix-style) - only implemented ones
  const coreCommands = ['ls', 'mk', 'touch', 'cp', 'mv', 'rm', 'stat'].filter((c) => isImplemented(c));
  lines.push('### Core Commands');
  lines.push('');
  for (const cmdName of coreCommands) {
    const cmd = specs.commands.find((c) => c.name === cmdName);
    if (cmd) {
      lines.push(`- \`${getCommandUsage(cmd)}\` - ${cmd.description}`);
    }
  }
  lines.push('');

  // Auth commands - check both direct implementation and operations
  const authCommandNames = ['login', 'logout', 'whoami', 'configure'];
  const authCommands = authCommandNames.filter((c) => {
    if (isImplemented(c)) return true;
    const cmd = specs.commands.find((s) => s.name === c);
    return cmd?.operations?.some((op) => isImplemented(c, op.name));
  });
  lines.push('### Authentication');
  lines.push('');
  for (const cmdName of authCommands) {
    const cmd = specs.commands.find((c) => c.name === cmdName);
    if (cmd) {
      lines.push(`- \`tigris ${cmd.name}\` - ${cmd.description}`);
    }
  }
  lines.push('');

  // Resource management
  const resourceCommands = ['organizations', 'buckets', 'forks', 'snapshots', 'objects'];
  const implementedResources = resourceCommands.filter((c) => {
    const cmd = specs.commands.find((s) => s.name === c);
    return cmd?.operations?.some((op) => isImplemented(c, op.name));
  });

  lines.push('### Resources');
  lines.push('');
  for (const cmdName of implementedResources) {
    const cmd = specs.commands.find((c) => c.name === cmdName);
    if (cmd) {
      lines.push(`- \`tigris ${cmd.name}\` - ${cmd.description}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');

  // Detailed sections
  lines.push('## Core Commands');
  lines.push('');
  for (const cmdName of coreCommands) {
    const cmd = specs.commands.find((c) => c.name === cmdName);
    if (cmd) {
      lines.push(generateCommandSection(cmd));
    }
  }

  lines.push('## Authentication');
  lines.push('');
  for (const cmdName of authCommands) {
    const cmd = specs.commands.find((c) => c.name === cmdName);
    if (cmd) {
      // Commands with operations use resource-style docs
      if (cmd.operations?.some((op) => isImplemented(cmdName, op.name))) {
        lines.push(generateResourceSection(cmd));
      } else {
        lines.push(generateCommandSection(cmd));
      }
    }
  }

  lines.push('## Resources');
  lines.push('');

  // Organizations first
  if (implementedResources.includes('organizations')) {
    const orgsCmd = specs.commands.find((c) => c.name === 'organizations');
    if (orgsCmd) {
      lines.push(generateResourceSection(orgsCmd));
    }
  }

  // Buckets section (buckets, forks, snapshots)
  const bucketRelated = ['buckets', 'forks', 'snapshots'].filter((c) => implementedResources.includes(c));
  if (bucketRelated.length > 0) {
    lines.push('### Buckets');
    lines.push('');
    lines.push('Buckets are containers for objects. You can also create forks and snapshots of buckets.');
    lines.push('');

    for (const cmdName of bucketRelated) {
      const cmd = specs.commands.find((c) => c.name === cmdName);
      if (cmd) {
        lines.push(generateResourceSection(cmd, '####'));
      }
    }
  }

  // Objects
  if (implementedResources.includes('objects')) {
    const objectsCmd = specs.commands.find((c) => c.name === 'objects');
    if (objectsCmd) {
      lines.push(generateResourceSection(objectsCmd));
    }
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
    readmeContent.slice(0, usageStart) + docsContent + '\n' + readmeContent.slice(licenseStart);

  writeFileSync(readmePath, newReadme);
  console.log('README.md updated successfully!');
}

// Main
const specsPath = join(__dirname, '..', 'src', 'specs.yaml');
const specsContent = readFileSync(specsPath, 'utf-8');
const specs = yaml.parse(specsContent) as Specs;

const docs = generateDocs(specs);
updateReadme(docs);
