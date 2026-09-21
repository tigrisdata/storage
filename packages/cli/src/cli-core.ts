/**
 * Shared CLI core functionality used by both cli.ts (npm) and cli-binary.ts (binary)
 */

import { trackCommand } from '@utils/analytics.js';
import { classifyError } from '@utils/errors.js';
import { exitWithError } from '@utils/exit.js';
import { printDeprecated } from '@utils/messages.js';
import {
  captureError,
  flushTelemetry,
  initTelemetry,
} from '@utils/telemetry.js';
import { Command as CommanderCommand, Option } from 'commander';

import {
  argumentHelpText,
  GLOBAL_OPTIONS_HEADING,
  groupHeading,
  helpConfiguration,
  OPTIONS_HEADING,
  setHelpDetails,
} from './help.js';
import type { Argument, CommandSpec, Specs } from './types.js';

/**
 * Check if the first positional arg is an unrecognized subcommand.
 * If so, print a helpful error and exit. Returns the positional args
 * for the caller to use if no error is found.
 */
function checkUnknownSubcommand(
  actionArgs: unknown[],
  spec: { commands?: CommandSpec[]; name?: string },
  currentPath: string[],
  specs: Specs,
  hasImplementation: ImplementationChecker
): string[] {
  // Commander passes the Command object as the last arg; its .args has positionals
  const last = actionArgs[actionArgs.length - 1];
  const positional =
    typeof last === 'object' && last !== null && 'args' in last
      ? ((last as { args: string[] }).args as string[])
      : (actionArgs.filter((a) => typeof a === 'string') as string[]);

  if (positional.length === 0) return positional;

  const first = positional[0];
  const subcommands = spec.commands ?? [];
  const implemented = subcommands.filter((c) =>
    commandHasAnyImplementation(c, [...currentPath, c.name], hasImplementation)
  );
  const knownNames = new Set(
    implemented.flatMap((c) => [
      c.name,
      ...(Array.isArray(c.alias) ? c.alias : c.alias ? [c.alias] : []),
    ])
  );

  if (!knownNames.has(first)) {
    const available = implemented.map((c) => c.name);
    const pathLabel =
      currentPath.length > 0
        ? `'${first}' for '${currentPath.join(' ')}'`
        : `'${first}'`;
    console.error(`Unknown command ${pathLabel}.`);
    if (available.length > 0) {
      console.error(`Available commands: ${available.join(', ')}`);
    }
    const helpCmd =
      currentPath.length > 0
        ? `${specs.name} ${currentPath.join(' ')} help`
        : `${specs.name} help`;
    console.error(`\nRun "${helpCmd}" for usage.`);
    process.exit(1);
  }

  return positional;
}

export type ModuleLoader = (commandPath: string[]) => Promise<{
  module: Record<string, unknown> | null;
  error: string | null;
}>;

export type ImplementationChecker = (commandPath: string[]) => boolean;

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
  initTelemetry();

  // Crash path: capture and flush before exiting. These handlers run at the top
  // of the stack, so unlike the synchronous exitWithError() used by commands
  // they can afford to await the flush. skipCapture avoids a double report.
  let handlingCrash = false;
  const reportCrashAndExit = async (error: unknown) => {
    // Re-entrancy guard: if reporting or exiting itself throws (e.g.
    // console.error hitting EPIPE on a closed stderr), the rejection would
    // re-enter this handler via unhandledRejection and loop forever without
    // exiting. On the second entry, exit hard instead. captureError and
    // flushTelemetry swallow their own errors, so the only re-entry source is
    // exitWithError below.
    if (handlingCrash) {
      process.exit(1);
    }
    handlingCrash = true;

    captureError(error, {
      crash: true,
      exitCode: classifyError(error).exitCode,
    });
    await flushTelemetry();
    exitWithError(error, undefined, { skipCapture: true });
  };

  process.on('unhandledRejection', (reason) => {
    if (reason === '' || reason === undefined) {
      console.error('\nOperation cancelled');
      process.exit(1);
    }
    void reportCrashAndExit(reason);
  });

  process.on('uncaughtException', (error) => {
    void reportCrashAndExit(error);
  });
}

/**
 * Validate command name to prevent path traversal attacks
 */
export function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export function commandHasAnyImplementation(
  command: CommandSpec,
  pathParts: string[],
  hasImplementation: ImplementationChecker
): boolean {
  // Removed commands are still registered so we can intercept and
  // redirect users to the replacement instead of "unknown command".
  if (command.removed) {
    return true;
  }

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

/**
 * Print a redirect message and exit. Used for hard-removed commands
 * and arguments. `subject` is the human-readable thing the user invoked
 * (e.g. `tigris buckets set-ttl` or `--region`).
 */
function printRemovedAndExit(
  subject: string,
  replacedBy: string | undefined
): never {
  const hint = replacedBy
    ? ` Use ${replacedBy} instead.`
    : ' See the changelog for migration guidance.';
  console.error(`${subject} was removed in this version.${hint}`);
  process.exit(1);
}

/**
 * Inspect parsed options for any argument the spec marks as removed.
 * If the user supplied one, print the redirect and exit.
 */
function checkRemovedArguments(
  args: Argument[] | undefined,
  options: Record<string, unknown>
): void {
  if (!args) return;
  for (const arg of args) {
    if (!arg.removed) continue;
    const value = getOptionValue(options, arg.name, args);
    if (value !== undefined) {
      printRemovedAndExit(`--${arg.name}`, arg.replaced_by);
    }
  }
}

/**
 * Merge global arguments (from specs.yaml definitions.global_arguments)
 * into a command's argument list, skipping any that the command already
 * defines by name or whose alias collides with an existing argument's alias.
 */
function getEffectiveArguments(
  globalArgs: Argument[],
  specArgs?: Argument[]
): Argument[] {
  const args = specArgs ?? [];
  const definedNames = new Set(args.map((a) => a.name));
  const definedAliases = new Set(
    args.filter((a) => a.alias).map((a) => a.alias)
  );
  const injected = globalArgs.filter(
    (g) =>
      !definedNames.has(g.name) && !(g.alias && definedAliases.has(g.alias))
  );
  return [...args, ...injected];
}

function optionFlags(arg: Argument): string {
  const isShortAlias =
    arg.alias && typeof arg.alias === 'string' && arg.alias.length === 1;
  const isLongAlias =
    arg.alias && typeof arg.alias === 'string' && arg.alias.length > 1;
  const flags = isShortAlias
    ? `-${arg.alias}, --${arg.name}`
    : isLongAlias
      ? `--${arg.alias}, --${arg.name}`
      : `--${arg.name}`;

  if (arg.type === 'flag') {
    // Flags don't take values
    return flags;
  }
  if (arg.type === 'boolean') {
    return `${flags} [value]`;
  }
  if (arg.options) {
    return `${flags} <value>`;
  }
  return arg.required || arg['required-when']
    ? `${flags} <value>`
    : `${flags} [value]`;
}

export function addArgumentsToCommand(
  cmd: CommanderCommand,
  args: Argument[] = [],
  globalArgs: Argument[] = []
) {
  // Global arguments go last and in their declared order, wherever a command
  // redeclares one, so the global section reads the same on every page.
  const globalRank = (arg: Argument) =>
    globalArgs.findIndex((globalArg) => globalArg.name === arg.name);
  const ordered = [
    ...args.filter((arg) => globalRank(arg) === -1),
    ...args
      .filter((arg) => globalRank(arg) !== -1)
      .sort((a, b) => globalRank(a) - globalRank(b)),
  ];

  ordered.forEach((arg) => {
    if (arg.type === 'positional') {
      const argumentName = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
      cmd.argument(argumentName, argumentHelpText(arg));
    } else if (arg.removed || arg.hidden) {
      // Register but hide from --help so commander still parses the value. A
      // removed argument is then intercepted by the dispatch handler.
      cmd.addOption(
        new Option(optionFlags(arg), arg.description ?? '').hideHelp()
      );
    } else {
      // Matched by name, so a command that redeclares a global argument (its
      // own --format values, --yes where it confirms) still lists it with the
      // other global options.
      if (globalArgs.length > 0) {
        cmd.optionsGroup(
          globalRank(arg) === -1 ? OPTIONS_HEADING : GLOBAL_OPTIONS_HEADING
        );
      }
      cmd.option(optionFlags(arg), argumentHelpText(arg), arg.default);
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
    if (argDef?.alias && typeof argDef.alias === 'string') {
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
      // `required` is invisible in --help and the generated docs for
      // non-positional arguments, so the description is the only place that
      // says what a valid value is or where to get one. Echo it here rather
      // than making the user go and run --help.
      if (arg.description) {
        console.error(`  ${arg.description}`);
      }
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
  // Set JSON mode globally for error handlers
  if (options.json || options.format === 'json') {
    globalThis.__TIGRIS_JSON_MODE = true;
  }

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

  // Usage analytics, recorded at the start of the command so the request
  // overlaps the command's own work and survives the synchronous exits that
  // most commands take. Never awaited: it must add neither latency nor a
  // failure mode to the command path.
  trackCommand(pathParts);

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
  const globalArgs = specs.definitions?.global_arguments ?? [];

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

    const cmd = parent
      .command(spec.name, spec.removed ? { hidden: true } : undefined)
      .description(spec.description ?? '')
      .summary(spec.help_text ?? '');
    if (spec.group) {
      cmd.helpGroup(groupHeading(spec.group));
    }
    setHelpDetails(cmd, { examples: spec.examples, groups: spec.groups });

    if (spec.alias) {
      const aliases = Array.isArray(spec.alias) ? spec.alias : [spec.alias];
      aliases.forEach((alias) => {
        cmd.alias(alias);
      });
    }

    // Removed commands: register a redirect-and-exit action; skip
    // children, arguments, and help registration entirely.
    if (spec.removed) {
      cmd.allowUnknownOption(true);
      cmd.allowExcessArguments(true);
      cmd.action(() => {
        printRemovedAndExit(
          `${specs.name} ${currentPath.join(' ')}`,
          spec.replaced_by
        );
      });
      continue;
    }

    if (spec.commands && spec.commands.length > 0) {
      // Has children - recurse
      registerCommands(config, cmd, spec.commands, currentPath);

      if (spec.default) {
        const defaultCmd = spec.commands.find((c) => c.name === spec.default);
        if (defaultCmd) {
          const allArguments = getEffectiveArguments(globalArgs, [
            ...(spec.arguments || []),
            ...(defaultCmd.arguments || []),
          ]);
          addArgumentsToCommand(cmd, allArguments, globalArgs);
          cmd.allowExcessArguments(true);

          cmd.action(async (...args) => {
            const options = args.pop();
            const positionalArgs = checkUnknownSubcommand(
              [options],
              spec,
              currentPath,
              specs,
              hasImplementation
            );

            const extracted = extractArgumentValues(
              allArguments,
              positionalArgs,
              options
            );

            if (
              allArguments.length > 0 &&
              !validateRequiredWhen(allArguments, extracted)
            ) {
              // validateRequiredWhen has already printed the reason. Exit
              // non-zero so scripts can tell a rejected invocation from a
              // successful one — returning here reported success.
              process.exit(1);
            }

            checkRemovedArguments(allArguments, extracted);

            if (defaultCmd.deprecated && defaultCmd.messages?.onDeprecated) {
              printDeprecated(defaultCmd.messages.onDeprecated);
            }

            await loadAndExecuteCommand(
              loadModule,
              [...currentPath, defaultCmd.name],
              positionalArgs,
              extracted
            );
          });
        }
      } else {
        cmd.allowExcessArguments(true);
        cmd.action((...args) => {
          checkUnknownSubcommand(
            args,
            spec,
            currentPath,
            specs,
            hasImplementation
          );
          cmd.outputHelp();
        });
      }
    } else {
      // Leaf command
      addArgumentsToCommand(
        cmd,
        getEffectiveArguments(globalArgs, spec.arguments),
        globalArgs
      );

      cmd.action(async (...args) => {
        const options = args.pop();
        const positionalArgs = args;

        const extracted = extractArgumentValues(
          spec.arguments || [],
          positionalArgs,
          options
        );

        if (
          spec.arguments &&
          !validateRequiredWhen(spec.arguments, extracted)
        ) {
          // See the matching branch above: exit non-zero rather than
          // returning, so a rejected invocation is visible to callers.
          process.exit(1);
        }

        checkRemovedArguments(spec.arguments, extracted);

        if (spec.deprecated && spec.messages?.onDeprecated) {
          printDeprecated(spec.messages.onDeprecated);
        }

        await loadAndExecuteCommand(
          loadModule,
          currentPath,
          positionalArgs,
          extracted
        );
      });
    }

    // `tigris <command> help` prints the same page as `--help`. Hidden so it
    // does not turn every leaf command into one with a "Commands:" section.
    cmd.command('help', { hidden: true }).action(() => {
      cmd.outputHelp();
    });
  }
}

/**
 * Create and configure the CLI program
 */
export function createProgram(config: CLIConfig): CommanderCommand {
  const { specs, version, hasImplementation } = config;

  const program = new CommanderCommand();
  program
    .name(specs.name)
    .description(specs.description)
    .version(version, '-V, --version', 'Show the CLI version')
    // Set before registerCommands(): subcommands inherit both settings.
    .helpOption('-h, --help', 'Show help')
    .configureHelp(helpConfiguration);

  registerCommands(config, program, specs.commands);

  // The root takes none of the global arguments itself; list them all, hidden
  // ones included, so the front page says what every command accepts.
  const globalOptions = (specs.definitions?.global_arguments ?? [])
    .filter((arg) => !arg.removed)
    .map((arg) => new Option(optionFlags(arg), argumentHelpText(arg)));
  setHelpDetails(program, { groups: specs.groups, globalOptions });

  // The built-in commands join the last group the spec declares.
  const builtinGroup = specs.groups?.[specs.groups.length - 1];

  const helpCommand = program
    .command('help')
    .description('Show general help')
    .action(() => {
      program.outputHelp();
    });

  const versionCommand = program
    .command('version')
    .description('Show the CLI version')
    .action(() => {
      console.log(version);
    });

  if (builtinGroup) {
    helpCommand.helpGroup(groupHeading(builtinGroup));
    versionCommand.helpGroup(groupHeading(builtinGroup));
  }

  program.allowExcessArguments(true);
  program.action((...args) => {
    checkUnknownSubcommand(
      args,
      { commands: specs.commands },
      [],
      specs,
      hasImplementation
    );
    program.outputHelp();
  });

  return program;
}
