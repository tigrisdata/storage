/**
 * Shared CLI core functionality used by both cli.ts (npm) and cli-binary.ts (binary)
 */

import { Command as CommanderCommand } from 'commander';
import type { Argument, CommandSpec, Specs } from './types.js';

export interface ModuleLoader {
  (commandPath: string[]): Promise<{
    module: Record<string, unknown> | null;
    error: string | null;
  }>;
}

export interface ImplementationChecker {
  (commandPath: string[]): boolean;
}

export interface CLIConfig {
  specs: Specs;
  version: string;
  loadModule: ModuleLoader;
  hasImplementation: ImplementationChecker;
}

/**
 * Setup global error handlers
 */
export function setupErrorHandlers() {
  process.on('unhandledRejection', (reason) => {
    if (reason === '' || reason === undefined) {
      console.error('\nOperation cancelled');
      process.exit(1);
    }
    console.error(
      '\nError:',
      reason instanceof Error ? reason.message : reason
    );
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    console.error('\nError:', error.message);
    process.exit(1);
  });
}

/**
 * Validate command name to prevent path traversal attacks
 */
export function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export function formatArgumentHelp(arg: Argument): string {
  let optionPart: string;

  if (arg.type === 'positional') {
    optionPart = `  ${arg.name}`;
  } else {
    optionPart = `  --${arg.name}`;
    if (arg.alias && typeof arg.alias === 'string' && arg.alias.length === 1) {
      optionPart += `, -${arg.alias}`;
    }
  }

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

export function commandHasAnyImplementation(
  command: CommandSpec,
  pathParts: string[],
  hasImplementation: ImplementationChecker
): boolean {
  if (hasImplementation(pathParts)) {
    return true;
  }

  if (command.commands) {
    return command.commands.some((child) =>
      commandHasAnyImplementation(
        child,
        [...pathParts, child.name],
        hasImplementation
      )
    );
  }

  return false;
}

export function showCommandHelp(
  specs: Specs,
  command: CommandSpec,
  pathParts: string[],
  hasImplementation: ImplementationChecker
) {
  const fullPath = pathParts.join(' ');
  console.log(`\n${specs.name} ${fullPath} - ${command.description}\n`);

  if (command.commands && command.commands.length > 0) {
    const availableCmds = command.commands.filter((cmd) =>
      commandHasAnyImplementation(
        cmd,
        [...pathParts, cmd.name],
        hasImplementation
      )
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

export function showMainHelp(
  specs: Specs,
  version: string,
  hasImplementation: ImplementationChecker
) {
  console.log(`Tigris CLI Version: ${version}\n`);
  console.log('Usage: tigris [command] [options]\n');
  console.log('Commands:');

  const availableCommands = specs.commands.filter((cmd) =>
    commandHasAnyImplementation(cmd, [cmd.name], hasImplementation)
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

export function addArgumentsToCommand(
  cmd: CommanderCommand,
  args: Argument[] = []
) {
  args.forEach((arg) => {
    if (arg.type === 'positional') {
      const argumentName = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
      cmd.argument(argumentName, arg.description);
    } else {
      const hasValidShortOption =
        arg.alias && typeof arg.alias === 'string' && arg.alias.length === 1;
      let optionString = hasValidShortOption
        ? `-${arg.alias}, --${arg.name}`
        : `--${arg.name}`;

      if (arg.type === 'flag') {
        // Flags don't take values
      } else if (arg.type === 'boolean') {
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

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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

export function validateRequiredWhen(
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

export function extractArgumentValues(
  args: Argument[],
  positionalArgs: string[],
  commandOrOptions: Record<string, unknown>
): Record<string, unknown> {
  let options: Record<string, unknown>;

  if (
    'optsWithGlobals' in commandOrOptions &&
    typeof commandOrOptions.optsWithGlobals === 'function'
  ) {
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

  const positionalArgDefs = args.filter((arg) => arg.type === 'positional');
  positionalArgDefs.forEach((arg, index) => {
    if (positionalArgs[index] !== undefined) {
      if (arg.multiple) {
        result[arg.name] = positionalArgs[index]
          .split(',')
          .map((s) => s.trim());
      } else {
        result[arg.name] = positionalArgs[index];
      }
    }
  });

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

async function loadAndExecuteCommand(
  loadModule: ModuleLoader,
  pathParts: string[],
  positionalArgs: string[] = [],
  options: Record<string, unknown> = {}
) {
  const { module, error: loadError } = await loadModule(pathParts);

  if (loadError || !module) {
    console.error(loadError);
    process.exit(1);
  }

  const functionName = pathParts[pathParts.length - 1];
  const commandFunction = module.default || module[functionName];

  if (typeof commandFunction !== 'function') {
    console.error(`Command not implemented: ${pathParts.join(' ')}`);
    process.exit(1);
  }

  await commandFunction({ ...options, _positional: positionalArgs });
}

/**
 * Register commands recursively from specs
 */
export function registerCommands(
  config: CLIConfig,
  parent: CommanderCommand,
  commandSpecs: CommandSpec[],
  pathParts: string[] = []
) {
  const { specs, loadModule, hasImplementation } = config;

  for (const spec of commandSpecs) {
    if (!isValidCommandName(spec.name)) {
      console.error(
        `Invalid command name "${spec.name}": only alphanumeric, hyphens, and underscores allowed`
      );
      process.exit(1);
    }

    const currentPath = [...pathParts, spec.name];

    // Skip commands with no implementations
    if (!commandHasAnyImplementation(spec, currentPath, hasImplementation)) {
      continue;
    }

    const cmd = parent.command(spec.name).description(spec.description);

    if (spec.alias) {
      const aliases = Array.isArray(spec.alias) ? spec.alias : [spec.alias];
      aliases.forEach((alias) => cmd.alias(alias));
    }

    if (spec.commands && spec.commands.length > 0) {
      // Has children - recurse
      registerCommands(config, cmd, spec.commands, currentPath);

      if (spec.default) {
        const defaultCmd = spec.commands.find((c) => c.name === spec.default);
        if (defaultCmd) {
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
              loadModule,
              [...currentPath, defaultCmd.name],
              positionalArgs,
              extractArgumentValues(allArguments, positionalArgs, options)
            );
          });
        }
      } else {
        cmd.action(() => {
          showCommandHelp(specs, spec, currentPath, hasImplementation);
        });
      }
    } else {
      // Leaf command
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
          loadModule,
          currentPath,
          positionalArgs,
          extractArgumentValues(spec.arguments || [], positionalArgs, options)
        );
      });
    }

    // Add help subcommand
    cmd
      .command('help')
      .description('Show help for this command')
      .action(() => {
        showCommandHelp(specs, spec, currentPath, hasImplementation);
      });
  }
}

/**
 * Create and configure the CLI program
 */
export function createProgram(config: CLIConfig): CommanderCommand {
  const { specs, version, hasImplementation } = config;

  const program = new CommanderCommand();
  program.name(specs.name).description(specs.description).version(version);

  registerCommands(config, program, specs.commands);

  program
    .command('help')
    .description('Show general help')
    .action(() => {
      showMainHelp(specs, version, hasImplementation);
    });

  program.action(() => {
    showMainHelp(specs, version, hasImplementation);
  });

  return program;
}
