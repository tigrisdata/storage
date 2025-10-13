#!/usr/bin/env node

import { Command as CommanderCommand } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as YAML from 'yaml';
import type { Argument, OperationSpec, CommandSpec } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const specsPath = join(__dirname, 'specs.yaml');
const specsContent = readFileSync(specsPath, 'utf8');
const specs = YAML.parse(specsContent);

function formatArgumentHelp(arg: Argument): string {
  let optionPart: string;

  if (arg.type === 'noun') {
    optionPart = `  ${arg.name}`;
  } else {
    optionPart = `  --${arg.name}`;
    if (arg.alias) {
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

  if (arg.type === 'noun') {
    description += ' [positional argument]';
  }

  if (arg.examples && arg.examples.length > 0) {
    description += ` (examples: ${arg.examples.join(', ')})`;
  }

  return `${paddedOptionPart}${description}`;
}

function showCommandHelp(command: CommandSpec) {
  console.log(`\n${specs.name} ${command.name} - ${command.description}\n`);

  if (command.operations && command.operations.length > 0) {
    console.log('Operations:');
    command.operations.forEach((op) => {
      let operationPart = `  ${op.name}`;
      if (op.alias) {
        const aliases = Array.isArray(op.alias) ? op.alias : [op.alias];
        operationPart += ` (${aliases.join(', ')})`;
      }
      const paddedOperationPart = operationPart.padEnd(24);
      console.log(`${paddedOperationPart}${op.description}`);
    });
    console.log();
  }

  if (command.arguments && command.arguments.length > 0) {
    console.log('Arguments:');
    command.arguments.forEach((arg) => {
      console.log(formatArgumentHelp(arg));
    });
    console.log();
  }

  console.log(
    `Use "${specs.name} ${command.name} <operation> help" for more information about an operation.`
  );
}

function showOperationHelp(command: CommandSpec, operation: OperationSpec) {
  console.log(
    `\n${specs.name} ${command.name} ${operation.name} - ${operation.description}\n`
  );

  if (operation.arguments && operation.arguments.length > 0) {
    console.log('Arguments:');
    operation.arguments.forEach((arg) => {
      console.log(formatArgumentHelp(arg));
    });
    console.log();
  }
}

function showMainHelp() {
  console.log(`\n${specs.name} - ${specs.description}\n`);
  console.log('Usage: tigris [command] [options]\n');
  console.log('Commands:');

  specs.commands.forEach((command: CommandSpec) => {
    let commandPart = `  ${command.name}`;
    if (command.alias) {
      commandPart += ` (${command.alias})`;
    }
    const paddedCommandPart = commandPart.padEnd(24);
    console.log(`${paddedCommandPart}${command.description}`);
  });

  console.log(`\nVersion: ${specs.version}`);
  console.log(
    `\nUse "${specs.name} <command> help" for more information about a command.`
  );
}

function addArgumentsToCommand(cmd: CommanderCommand, args: Argument[] = []) {
  args.forEach((arg) => {
    if (arg.type === 'noun') {
      // Handle noun arguments as positional arguments
      const argumentName = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
      cmd.argument(argumentName, arg.description);
    } else {
      // Handle regular flag/option arguments
      let optionString = `--${arg.name}`;
      if (arg.alias) {
        optionString += `, -${arg.alias}`;
      }

      if (arg.options) {
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
          `Error: --${arg.name} is required when --${dependentArg} is ${expectedValue}`
        );
        return false;
      }
    }

    if (arg.required && !getOptionValue(options, arg.name, args)) {
      console.error(`Error: --${arg.name} is required`);
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
    if (argDef && argDef.alias) {
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

async function loadAndExecuteCommand(
  commandName: string,
  operationName?: string,
  positionalArgs: string[] = [],
  options: Record<string, unknown> = {}
) {
  try {
    let modulePath: string;
    let functionName: string;

    if (operationName) {
      // For commands with operations: try command/operation.ts first, then command/operation/index.ts
      modulePath = `./lib/${commandName}/${operationName}.js`;
      functionName = operationName;
    } else {
      // For direct commands: try command.ts first, then command/index.ts
      modulePath = `./lib/${commandName}.js`;
      functionName = commandName;
    }

    try {
      const module = await import(modulePath);
      const commandFunction = module.default || module[functionName];

      if (typeof commandFunction === 'function') {
        await commandFunction({ ...options, _positional: positionalArgs });
      } else {
        console.error(
          `No default export or ${functionName} function found in ${modulePath}`
        );
      }
    } catch (importError) {
      // Try alternative path with /index
      try {
        const indexModulePath = operationName
          ? `./lib/${commandName}/${operationName}/index.js`
          : `./lib/${commandName}/index.js`;

        const module = await import(indexModulePath);
        const commandFunction = module.default || module[functionName];

        if (typeof commandFunction === 'function') {
          await commandFunction({ ...options, _positional: positionalArgs });
        } else {
          console.error(
            `No default export or ${functionName} function found in ${indexModulePath}`
          );
        }
      } catch (indexImportError) {
        console.error(
          `Command implementation not found: ${modulePath} or ${operationName ? `${commandName}/${operationName}/index` : `${commandName}/index`}`
        );
        console.error(
          'Create the implementation file with a default export function.'
        );
      }
    }
  } catch (error) {
    console.error(`Error executing command: ${error}`);
  }
}

const program = new CommanderCommand();

program.name(specs.name).description(specs.description).version(specs.version);

function extractArgumentValues(
  args: Argument[],
  positionalArgs: string[],
  commandOrOptions: Record<string, unknown>
): Record<string, unknown> {
  // If this is a Commander Command object, extract opts()
  let options: Record<string, unknown>;

  if (
    'opts' in commandOrOptions &&
    typeof commandOrOptions.opts === 'function'
  ) {
    options = (commandOrOptions.opts as () => Record<string, unknown>)();
  } else {
    options = commandOrOptions;
  }

  const result = { ...options };

  // Map positional arguments to their names
  const positionalArgDefs = args.filter((arg) => arg.type === 'noun');
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
    if (arg.multiple && arg.type !== 'noun' && result[arg.name]) {
      if (typeof result[arg.name] === 'string') {
        result[arg.name] = (result[arg.name] as string)
          .split(',')
          .map((s) => s.trim());
      }
    }
  });

  return result;
}

specs.commands.forEach((command: CommandSpec) => {
  const commandCmd = program
    .command(command.name)
    .description(command.description);

  if (command.alias) {
    commandCmd.alias(command.alias);
  }

  if (command.operations && command.operations.length > 0) {
    command.operations.forEach((operationSpec: OperationSpec) => {
      const subCmd = commandCmd
        .command(operationSpec.name)
        .description(operationSpec.description);

      if (operationSpec.alias) {
        const aliases = Array.isArray(operationSpec.alias)
          ? operationSpec.alias
          : [operationSpec.alias];
        aliases.forEach((alias: string) => subCmd.alias(alias));
      }

      addArgumentsToCommand(subCmd, operationSpec.arguments);

      subCmd.action(async (...args) => {
        // Handle both positional and option arguments
        const options = args.pop(); // Last argument is always options
        const positionalArgs = args; // Remaining are positional arguments

        if (
          operationSpec.arguments &&
          !validateRequiredWhen(
            operationSpec.arguments,
            extractArgumentValues(
              operationSpec.arguments,
              positionalArgs,
              options
            )
          )
        ) {
          return;
        }

        await loadAndExecuteCommand(
          command.name,
          operationSpec.name,
          positionalArgs,
          extractArgumentValues(
            operationSpec.arguments || [],
            positionalArgs,
            options
          )
        );
      });

      subCmd
        .command('help')
        .description('Show help for this operation')
        .action(() => {
          showOperationHelp(command, operationSpec);
        });
    });

    if (command.default) {
      const defaultOperation = command.operations?.find(
        (c: OperationSpec) => c.name === command.default
      );

      if (defaultOperation) {
        addArgumentsToCommand(commandCmd, defaultOperation.arguments);

        commandCmd.action(async (...args) => {
          const options = args.pop();
          const positionalArgs = args;

          if (
            defaultOperation.arguments &&
            !validateRequiredWhen(
              defaultOperation.arguments,
              extractArgumentValues(
                defaultOperation.arguments,
                positionalArgs,
                options
              )
            )
          ) {
            return;
          }

          await loadAndExecuteCommand(
            command.name,
            defaultOperation.name,
            positionalArgs,
            extractArgumentValues(
              defaultOperation.arguments || [],
              positionalArgs,
              options
            )
          );
        });
      }
    } else {
      commandCmd.action(() => {
        showCommandHelp(command);
      });
    }
  } else {
    addArgumentsToCommand(commandCmd, command.arguments);

    commandCmd.action(async (...args) => {
      const options = args.pop();
      const positionalArgs = args;

      if (
        command.arguments &&
        !validateRequiredWhen(
          command.arguments,
          extractArgumentValues(command.arguments, positionalArgs, options)
        )
      ) {
        return;
      }

      await loadAndExecuteCommand(
        command.name,
        undefined,
        positionalArgs,
        extractArgumentValues(command.arguments || [], positionalArgs, options)
      );
    });
  }

  commandCmd
    .command('help')
    .description('Show help for this command')
    .action(() => {
      showCommandHelp(command);
    });
});

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
