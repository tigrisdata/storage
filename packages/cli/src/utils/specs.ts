import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as YAML from 'yaml';
import type { CommandSpec, OperationSpec, Argument } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedSpecs: { commands: CommandSpec[] } | null = null;

function findSpecsPath(): string {
  // Try to find specs.yaml by walking up the directory tree
  let currentDir = __dirname;

  // Try up to 5 levels up
  for (let i = 0; i < 5; i++) {
    const specsPath = join(currentDir, 'specs.yaml');
    if (existsSync(specsPath)) {
      return specsPath;
    }
    currentDir = join(currentDir, '..');
  }

  throw new Error('Could not find specs.yaml');
}

function loadSpecs(): { commands: CommandSpec[] } {
  if (!cachedSpecs) {
    const specsPath = findSpecsPath();
    const specsContent = readFileSync(specsPath, 'utf8');
    cachedSpecs = YAML.parse(specsContent);
  }
  return cachedSpecs!;
}

export function getCommandSpec(
  commandName: string,
  operationName?: string
): OperationSpec | CommandSpec | null {
  const specs = loadSpecs();
  const command = specs.commands.find(
    (cmd: CommandSpec) => cmd.name === commandName
  );

  if (!command) {
    return null;
  }

  if (operationName && command.operations) {
    return (
      command.operations.find(
        (op: OperationSpec) => op.name === operationName
      ) || null
    );
  }

  return command;
}

export function getArgumentSpec(
  commandName: string,
  argumentName: string,
  operationName?: string
): Argument | null {
  const spec = getCommandSpec(commandName, operationName);

  if (!spec || !spec.arguments) {
    return null;
  }

  return (
    spec.arguments.find((arg: Argument) => arg.name === argumentName) || null
  );
}

export function buildPromptChoices(argument: Argument) {
  if (!argument.options) {
    return null;
  }

  // Handle simple string array options
  if (
    Array.isArray(argument.options) &&
    typeof argument.options[0] === 'string'
  ) {
    return (argument.options as string[]).map((option) => ({
      name: option,
      message: option.charAt(0).toUpperCase() + option.slice(1),
      value: option,
    }));
  }

  // Handle complex option objects with name, value, and description
  if (
    Array.isArray(argument.options) &&
    typeof argument.options[0] === 'object'
  ) {
    return (
      argument.options as Array<{
        name: string;
        value: string;
        description?: string;
      }>
    ).map((option) => ({
      name: option.value,
      message: option.description
        ? `${option.name} - ${option.description}`
        : option.name,
      value: option.value,
    }));
  }

  return null;
}
