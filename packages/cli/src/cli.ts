#!/usr/bin/env node

import { Command as CommanderCommand } from 'commander';
import specs from '../specs.json';

interface Argument {
  name: string;
  description: string;
  alias?: string;
  options?: string[] | Array<{ name: string; value: string; description: string }>;
  default?: string;
  required?: boolean;
  'required-when'?: string;
  type?: string;
}

interface OperationSpec {
  name: string;
  description: string;
  alias?: string | string[];
  arguments?: Argument[];
}

interface CommandSpec {
  name: string;
  description: string;
  alias?: string;
  arguments?: Argument[];
  operations?: OperationSpec[];
  default?: string;
}

function formatArgumentHelp(arg: Argument): string {
  let optionPart = `  --${arg.name}`;
  if (arg.alias) {
    optionPart += `, -${arg.alias}`;
  }

  // Pad option part to ensure consistent alignment, adjust for longer aliases
  const minPadding = 26;
  const paddedOptionPart = optionPart.length >= minPadding ?
    optionPart + '  ' :
    optionPart.padEnd(minPadding);
  let description = arg.description;

  if (arg.options) {
    if (Array.isArray(arg.options) && typeof arg.options[0] === 'string') {
      description += ` (options: ${(arg.options as string[]).join(', ')})`;
    } else {
      description += ` (options: ${(arg.options as Array<{ name: string; value: string }>).map(o => o.value).join(', ')})`;
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

  if (arg.type === 'multiple') {
    description += ' [multiple values: comma-separated]';
  }

  return `${paddedOptionPart}${description}`;
}

function showCommandHelp(command: CommandSpec) {
  console.log(`\n${specs.name} ${command.name} - ${command.description}\n`);

  if (command.operations && command.operations.length > 0) {
    console.log('Operations:');
    command.operations.forEach(op => {
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
    command.arguments.forEach(arg => {
      console.log(formatArgumentHelp(arg));
    });
    console.log();
  }

  console.log(`Use "${specs.name} ${command.name} <operation> help" for more information about an operation.`);
}

function showOperationHelp(command: CommandSpec, operation: OperationSpec) {
  console.log(`\n${specs.name} ${command.name} ${operation.name} - ${operation.description}\n`);

  if (operation.arguments && operation.arguments.length > 0) {
    console.log('Arguments:');
    operation.arguments.forEach(arg => {
      console.log(formatArgumentHelp(arg));
    });
    console.log();
  }
}

function showMainHelp() {
  console.log(`\n${specs.name} - ${specs.description}\n`);
  console.log('Usage: tigris [command] [options]\n');
  console.log('Commands:');

  specs.commands.forEach(command => {
    let commandPart = `  ${command.name}`;
    if (command.alias) {
      commandPart += ` (${command.alias})`;
    }
    const paddedCommandPart = commandPart.padEnd(24);
    console.log(`${paddedCommandPart}${command.description}`);
  });

  console.log(`\nVersion: ${specs.version}`);
  console.log(`\nUse "${specs.name} <command> help" for more information about a command.`);
}

function addArgumentsToCommand(cmd: CommanderCommand, args: Argument[] = []) {
  args.forEach(arg => {
    let optionString = `--${arg.name}`;
    if (arg.alias) {
      optionString += `, -${arg.alias}`;
    }

    if (arg.options) {
      optionString += ' <value>';
    } else {
      optionString += arg.required || arg['required-when'] ? ' <value>' : ' [value]';
    }

    cmd.option(optionString, arg.description, arg.default);
  });
}

function validateRequiredWhen(args: Argument[], options: Record<string, unknown>): boolean {
  for (const arg of args) {
    if (arg['required-when']) {
      const [dependentArg, expectedValue] = arg['required-when'].split('=');

      const dependentValue = getOptionValue(options, dependentArg, args);
      const currentValue = getOptionValue(options, arg.name, args);

      if (dependentValue === expectedValue && !currentValue) {
        console.error(`Error: --${arg.name} is required when --${dependentArg} is ${expectedValue}`);
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

function getOptionValue(options: Record<string, unknown>, argName: string, args?: Argument[]): unknown {
  if (args) {
    const argDef = args.find(a => a.name === argName);
    if (argDef && argDef.alias) {
      const aliasKey = argDef.alias.charAt(0).toUpperCase() + argDef.alias.slice(1);
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
    camelCase(argName)
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

const program = new CommanderCommand();

program
  .name(specs.name)
  .description(specs.description)
  .version(specs.version);

specs.commands.forEach(command => {
  const commandCmd = program
    .command(command.name)
    .description(command.description);

  if (command.alias) {
    commandCmd.alias(command.alias);
  }

  if (command.operations && command.operations.length > 0) {
    command.operations.forEach(operationSpec => {
      const subCmd = commandCmd
        .command(operationSpec.name)
        .description(operationSpec.description)
        .action((options) => {
          if (operationSpec.arguments && !validateRequiredWhen(operationSpec.arguments, options)) {
            return;
          }
          console.log(`Executing: ${command.name} ${operationSpec.name}`, options);
        });

      if (operationSpec.alias) {
        const aliases = Array.isArray(operationSpec.alias) ? operationSpec.alias : [operationSpec.alias];
        aliases.forEach(alias => subCmd.alias(alias));
      }

      addArgumentsToCommand(subCmd, operationSpec.arguments);

      subCmd
        .command('help')
        .description('Show help for this operation')
        .action(() => {
          showOperationHelp(command, operationSpec);
        });
    });

    if (command.default) {
      commandCmd.action((options) => {
        const defaultOperation = command.operations?.find(c => c.name === command.default);
        if (defaultOperation) {
          if (defaultOperation.arguments && !validateRequiredWhen(defaultOperation.arguments, options)) {
            return;
          }
          console.log(`Executing: ${command.name} ${defaultOperation.name}`, options);
        }
      });

      if (command.operations.find(c => c.name === command.default)?.arguments) {
        addArgumentsToCommand(commandCmd, command.operations.find(c => c.name === command.default)?.arguments);
      }
    } else {
      commandCmd.action(() => {
        showCommandHelp(command);
      });
    }
  } else {
    addArgumentsToCommand(commandCmd, command.arguments);
    commandCmd.action((options) => {
      if (command.arguments && !validateRequiredWhen(command.arguments, options)) {
        return;
      }
      console.log(`Executing: ${command.name}`, options);
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
