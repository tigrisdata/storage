#!/usr/bin/env node

import { Command as CommanderCommand } from 'commander';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Argument, CommandSpec } from './types.js';
import { loadSpecs } from './utils/specs.js';
import { checkForUpdates } from './utils/update-check.js';
import { version } from '../package.json';

// Global handler for user cancellation (Ctrl+C) and unhandled errors
process.on('unhandledRejection', (reason) => {
  // Enquirer throws empty string or undefined when user cancels with Ctrl+C
  if (reason === '' || reason === undefined) {
    console.error('\nOperation cancelled');
    process.exit(1);
  }
  // For other unhandled rejections, show the error
  console.error('\nError:', reason instanceof Error ? reason.message : reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('\nError:', error.message);
  process.exit(1);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const specs = loadSpecs();

/**
 * Validate command name to prevent path traversal attacks
 * Only allows alphanumeric, hyphens, and underscores
 */
function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Check if a command path has an implementation
 * @param pathParts - Array of command path parts, e.g., ['iam', 'policies', 'get']
 */
function hasImplementation(pathParts: string[]): boolean {
  if (pathParts.length === 0) return false;

  // Try direct file: lib/iam/policies/get.js
  const directPath = join(__dirname, 'lib', ...pathParts) + '.js';
  if (existsSync(directPath)) return true;

  // Try index file: lib/iam/policies/get/index.js
  const indexPath = join(__dirname, 'lib', ...pathParts, 'index.js');
  if (existsSync(indexPath)) return true;

  return false;
}

function formatArgumentHelp(arg: Argument): string {
  let optionPart: string;

  if (arg.type === 'positional') {
    optionPart = `  ${arg.name}`;
  } else {
    optionPart = `  --${arg.name}`;
    // Only show short option if it's a single character (Commander requirement)
    if (arg.alias && typeof arg.alias === 'string' && arg.alias.length === 1) {
      optionPart += `, -${arg.alias}`;
    }
  }

  // Pad option part to ensure consistent alignment, adjust for longer aliases
  const minPadding = 26;
  const paddedOptionPart =
    optionPart.length >= minPadding
      ? optionPart + '  '
      : optionPart.padEnd(minPadding);
  let description = arg.description;

  if (arg.options) {
    if (Array.isArray(arg.options) && typeof arg.options[0] === 'string') {
      description += ` (options: ${(arg.options as string[]).join(', ')})`;
    } else {
      description += ` (options: ${(arg.options as Array<{ name: string; value: string }>).map((o) => o.value).join(', ')})`;
    }
  }

  if (arg.default) {
    description += ` [default: ${arg.default}]`;
  }

  if (arg.required) {
    description += ' [required]';
  }

  if (arg['required-when']) {
    description += ` [required when: ${arg['required-when']}]`;
  }

  if (arg.multiple) {
    description += ' [multiple values: comma-separated]';
  }

  if (arg.type === 'positional') {
    description += ' [positional argument]';
  }

  if (arg.examples && arg.examples.length > 0) {
    description += ` (examples: ${arg.examples.join(', ')})`;
  }

  return `${paddedOptionPart}${description}`;
}

/**
 * Show help for a command at any nesting level
 */
function showCommandHelp(command: CommandSpec, pathParts: string[]) {
  const fullPath = pathParts.join(' ');
  console.log(`\n${specs.name} ${fullPath} - ${command.description}\n`);

  if (command.commands && command.commands.length > 0) {
    const availableCmds = command.commands.filter((cmd) =>
      commandHasAnyImplementation(cmd, [...pathParts, cmd.name])
    );

    if (availableCmds.length > 0) {
      console.log('Commands:');
      availableCmds.forEach((cmd) => {
        let cmdPart = `  ${cmd.name}`;
        if (cmd.alias) {
          const aliases = Array.isArray(cmd.alias) ? cmd.alias : [cmd.alias];
          cmdPart += ` (${aliases.join(', ')})`;
        }
        const paddedCmdPart = cmdPart.padEnd(24);
        console.log(`${paddedCmdPart}${cmd.description}`);
      });
      console.log();
    }
  }

  if (command.arguments && command.arguments.length > 0) {
    console.log('Arguments:');
    command.arguments.forEach((arg) => {
      console.log(formatArgumentHelp(arg));
    });
    console.log();
  }

  if (command.examples && command.examples.length > 0) {
    console.log('Examples:');
    command.examples.forEach((ex) => {
      console.log(`  ${ex}`);
    });
    console.log();
  }

  if (command.commands && command.commands.length > 0) {
    console.log(
      `Use "${specs.name} ${fullPath} <command> help" for more information about a command.`
    );
  }
}

/**
 * Recursively check if a command or any of its children have implementations
 */
function commandHasAnyImplementation(
  command: CommandSpec,
  pathParts: string[]
): boolean {
  // Check if this command itself has implementation (leaf node)
  if (hasImplementation(pathParts)) {
    return true;
  }

  // Check if any child command has implementation
  if (command.commands) {
    return command.commands.some((child) =>
      commandHasAnyImplementation(child, [...pathParts, child.name])
    );
  }

  return false;
}

function showMainHelp() {
  console.log(`Tigris CLI Version: ${version}\n`);
  console.log('Usage: tigris [command] [options]\n');
  console.log('Commands:');

  const availableCommands = specs.commands.filter((cmd) =>
    commandHasAnyImplementation(cmd, [cmd.name])
  );

  availableCommands.forEach((command: CommandSpec) => {
    let commandPart = `  ${command.name}`;
    if (command.alias) {
      const aliases = Array.isArray(command.alias)
        ? command.alias
        : [command.alias];
      commandPart += ` (${aliases.join(', ')})`;
    }
    const paddedCommandPart = commandPart.padEnd(24);
    console.log(`${paddedCommandPart}${command.description}`);
  });
  console.log(
    `\nUse "${specs.name} <command> help" for more information about a command.`
  );
}

function addArgumentsToCommand(cmd: CommanderCommand, args: Argument[] = []) {
  args.forEach((arg) => {
    if (arg.type === 'positional') {
      // Handle positional arguments
      const argumentName = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
      cmd.argument(argumentName, arg.description);
    } else {
      // Handle regular flag/option arguments
      // Commander expects single-character short options: -p, --prefix <value>
      // Multi-character aliases are not supported by Commander
      const hasValidShortOption =
        arg.alias && typeof arg.alias === 'string' && arg.alias.length === 1;
      let optionString = hasValidShortOption
        ? `-${arg.alias}, --${arg.name}`
        : `--${arg.name}`;

      if (arg.type === 'flag') {
        // Flags don't take values - presence means true
      } else if (arg.type === 'boolean') {
        // Boolean options take optional value, defaulting to true when present without value
        optionString += ' [value]';
      } else if (arg.options) {
        optionString += ' <value>';
      } else {
        optionString +=
          arg.required || arg['required-when'] ? ' <value>' : ' [value]';
      }

      cmd.option(optionString, arg.description, arg.default);
    }
  });
}

function validateRequiredWhen(
  args: Argument[],
  options: Record<string, unknown>
): boolean {
  for (const arg of args) {
    if (arg['required-when']) {
      const [dependentArg, expectedValue] = arg['required-when'].split('=');

      const dependentValue = getOptionValue(options, dependentArg, args);
      const currentValue = getOptionValue(options, arg.name, args);

      if (dependentValue === expectedValue && !currentValue) {
        console.error(
          `--${arg.name} is required when --${dependentArg} is ${expectedValue}`
        );
        return false;
      }
    }

    if (arg.required && !getOptionValue(options, arg.name, args)) {
      console.error(`--${arg.name} is required`);
      return false;
    }
  }
  return true;
}

function getOptionValue(
  options: Record<string, unknown>,
  argName: string,
  args?: Argument[]
): unknown {
  if (args) {
    const argDef = args.find((a) => a.name === argName);
    if (argDef && argDef.alias && typeof argDef.alias === 'string') {
      const aliasKey =
        argDef.alias.charAt(0).toUpperCase() + argDef.alias.slice(1);
      if (options[aliasKey] !== undefined) {
        return options[aliasKey];
      }
    }
  }

  const possibleKeys = [
    argName,
    argName.replace(/-/g, ''),
    argName.replace(/-/g, '').toLowerCase(),
    argName.charAt(0).toUpperCase(),
    camelCase(argName),
  ];

  for (const key of possibleKeys) {
    if (options[key] !== undefined) {
      return options[key];
    }
  }
  return undefined;
}

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Load module from path parts
 * @param pathParts - Array of command path parts, e.g., ['iam', 'policies', 'get']
 */
async function loadModule(
  pathParts: string[]
): Promise<{ module: Record<string, unknown> | null; error: string | null }> {
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
}

/**
 * Load and execute a command
 * @param pathParts - Array of command path parts
 */
async function loadAndExecuteCommand(
  pathParts: string[],
  positionalArgs: string[] = [],
  options: Record<string, unknown> = {},
  message?: string
) {
  // Display message if available
  if (message) {
    const formattedMessage = message.replace(/\\n/g, '\n');
    console.log(formattedMessage);
  }

  // Load module
  const { module, error: loadError } = await loadModule(pathParts);

  if (loadError || !module) {
    console.error(loadError);
    process.exit(1);
  }

  // Get command function - use default export or named export matching last path part
  const functionName = pathParts[pathParts.length - 1];
  const commandFunction = module.default || module[functionName];

  if (typeof commandFunction !== 'function') {
    console.error(`Command not implemented: ${pathParts.join(' ')}`);
    process.exit(1);
  }

  // Execute command - let errors propagate naturally
  await commandFunction({ ...options, _positional: positionalArgs });
}

function extractArgumentValues(
  args: Argument[],
  positionalArgs: string[],
  commandOrOptions: Record<string, unknown>
): Record<string, unknown> {
  // If this is a Commander Command object, extract options
  // Use optsWithGlobals() to include parent command options (for subcommands)
  let options: Record<string, unknown>;

  if (
    'optsWithGlobals' in commandOrOptions &&
    typeof commandOrOptions.optsWithGlobals === 'function'
  ) {
    // optsWithGlobals includes options from parent commands
    options = (
      commandOrOptions.optsWithGlobals as () => Record<string, unknown>
    )();
  } else if (
    'opts' in commandOrOptions &&
    typeof commandOrOptions.opts === 'function'
  ) {
    options = (commandOrOptions.opts as () => Record<string, unknown>)();
  } else {
    options = commandOrOptions;
  }

  const result = { ...options };

  // Map positional arguments to their names
  const positionalArgDefs = args.filter((arg) => arg.type === 'positional');
  positionalArgDefs.forEach((arg, index) => {
    if (positionalArgs[index] !== undefined) {
      if (arg.multiple) {
        // For multiple arguments, split by comma
        result[arg.name] = positionalArgs[index]
          .split(',')
          .map((s) => s.trim());
      } else {
        result[arg.name] = positionalArgs[index];
      }
    }
  });

  // Handle multiple flag arguments
  args.forEach((arg) => {
    if (arg.multiple && arg.type !== 'positional' && result[arg.name]) {
      if (typeof result[arg.name] === 'string') {
        result[arg.name] = (result[arg.name] as string)
          .split(',')
          .map((s) => s.trim());
      }
    }
  });

  return result;
}

/**
 * Recursively register commands from spec
 */
function registerCommands(
  parent: CommanderCommand,
  commandSpecs: CommandSpec[],
  pathParts: string[] = []
) {
  for (const spec of commandSpecs) {
    // Validate command name to prevent path traversal
    if (!isValidCommandName(spec.name)) {
      console.error(
        `Invalid command name "${spec.name}": only alphanumeric, hyphens, and underscores allowed`
      );
      process.exit(1);
    }

    const currentPath = [...pathParts, spec.name];
    const cmd = parent.command(spec.name).description(spec.description);

    // Handle aliases
    if (spec.alias) {
      const aliases = Array.isArray(spec.alias) ? spec.alias : [spec.alias];
      aliases.forEach((alias) => cmd.alias(alias));
    }

    // Check if this command has children
    if (spec.commands && spec.commands.length > 0) {
      // Has children - recurse
      registerCommands(cmd, spec.commands, currentPath);

      // Check for default command
      if (spec.default) {
        const defaultCmd = spec.commands.find((c) => c.name === spec.default);
        if (defaultCmd) {
          // Add arguments from both parent and default child
          addArgumentsToCommand(cmd, spec.arguments);
          addArgumentsToCommand(cmd, defaultCmd.arguments);

          const allArguments = [
            ...(spec.arguments || []),
            ...(defaultCmd.arguments || []),
          ];

          cmd.action(async (...args) => {
            const options = args.pop();
            const positionalArgs = args;

            if (
              allArguments.length > 0 &&
              !validateRequiredWhen(
                allArguments,
                extractArgumentValues(allArguments, positionalArgs, options)
              )
            ) {
              return;
            }

            await loadAndExecuteCommand(
              [...currentPath, defaultCmd.name],
              positionalArgs,
              extractArgumentValues(allArguments, positionalArgs, options),
              spec.message || defaultCmd.message
            );
          });
        }
      } else {
        // No default - show help when command is called without subcommand
        cmd.action(() => {
          showCommandHelp(spec, currentPath);
        });
      }

      // Add help subcommand
      cmd
        .command('help')
        .description('Show help for this command')
        .action(() => {
          showCommandHelp(spec, currentPath);
        });
    } else {
      // Leaf node - this is an executable command
      addArgumentsToCommand(cmd, spec.arguments);

      cmd.action(async (...args) => {
        const options = args.pop();
        const positionalArgs = args;

        if (
          spec.arguments &&
          !validateRequiredWhen(
            spec.arguments,
            extractArgumentValues(spec.arguments, positionalArgs, options)
          )
        ) {
          return;
        }

        await loadAndExecuteCommand(
          currentPath,
          positionalArgs,
          extractArgumentValues(spec.arguments || [], positionalArgs, options),
          spec.message
        );
      });

      // Add help for leaf commands too
      cmd
        .command('help')
        .description('Show help for this command')
        .action(() => {
          showCommandHelp(spec, currentPath);
        });
    }
  }
}

const program = new CommanderCommand();

program.name(specs.name).description(specs.description).version(specs.version);

// Register all commands recursively
registerCommands(program, specs.commands);

program
  .command('help')
  .description('Show general help')
  .action(() => {
    showMainHelp();
  });

program.action(() => {
  showMainHelp();
});

program.parse();
checkForUpdates();
