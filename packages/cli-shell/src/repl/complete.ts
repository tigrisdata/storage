/**
 * Tab completion.
 *
 * Command and flag completion is derived from `specs.yaml` by way of
 * `cli.specs()`, so it stays correct as commands are added without anything
 * here changing.
 */

import type { BrowserCli } from '@tigrisdata/cli/browser';
import { getCommandNames } from 'just-bash';

import type { ShellEngine } from '../shell.js';
import type { ShellSession } from './session.js';

interface SpecCommand {
  name: string;
  alias?: string | string[];
  commands?: SpecCommand[];
  arguments?: Array<{ name: string; type?: string }>;
  removed?: boolean;
}

export interface CompletionContext {
  engine: ShellEngine;
  session: ShellSession;
  cwd: string;
}

/** Returns the candidate completions and the token they complete. */
export async function computeCompletions(
  line: string,
  context: CompletionContext
): Promise<[string[], string]> {
  const tokenStart = line.search(/\S*$/);
  const token = line.slice(tokenStart);
  const before = line.slice(0, tokenStart).trim();
  const words = before === '' ? [] : before.split(/\s+/);

  if (words.length === 0) {
    return [filter(commandNames(context), token), token];
  }

  const [verb, ...rest] = words;

  const cliPath = cliPathFor(verb, rest);
  if (cliPath) {
    const suggestions = completeSpec(context.engine.cli, cliPath, token);
    if (suggestions.length > 0) return [filter(suggestions, token), token];
  }

  return [filter(await completePath(context, token), token), token];
}

function commandNames(context: CompletionContext): string[] {
  // CLI commands are deliberately not offered bare: only `tigris` and `t3` are
  // registered, so completing `buckets` would produce a command-not-found.
  return [
    ...context.session.shellCommands,
    ...getCommandNames(),
    'tigris',
    't3',
  ].sort();
}

/** The spec path being completed, or null when the line is not a CLI command. */
function cliPathFor(verb: string, rest: string[]): string[] | null {
  return verb === 'tigris' || verb === 't3' ? rest : null;
}

function completeSpec(
  cli: BrowserCli,
  path: string[],
  token: string
): string[] {
  let commands = (cli.specs() as { commands: SpecCommand[] }).commands;
  let current: SpecCommand | undefined;
  // The path as `cli.commands()` spells it: canonical names, not aliases.
  const canonical: string[] = [];

  for (const part of path) {
    current = commands.find(
      (command) => command.name === part || matchesAlias(command, part)
    );
    if (!current) return [];
    canonical.push(current.name);
    commands = current.commands ?? [];
  }

  if (token.startsWith('-')) {
    return (current?.arguments ?? [])
      .filter((argument) => argument.type !== 'positional')
      .map((argument) => `--${argument.name}`);
  }

  // The spec tree also holds what the browser build leaves out — `bundle`,
  // `update`, `init`, `telemetry` — which would complete and then fail as
  // unavailable. Offer only what this build can run.
  const available = availablePaths(cli);
  return commands
    .filter(
      (command) =>
        !command.removed &&
        available.has([...canonical, command.name].join('/'))
    )
    .map((command) => command.name);
}

/** Every runnable command path and every group on the way to one. */
function availablePaths(cli: BrowserCli): Set<string> {
  const paths = new Set<string>();
  for (const command of cli.commands()) {
    const parts = command.split('/');
    for (let depth = 1; depth <= parts.length; depth++) {
      paths.add(parts.slice(0, depth).join('/'));
    }
  }
  return paths;
}

function matchesAlias(command: SpecCommand, name: string): boolean {
  if (!command.alias) return false;
  return Array.isArray(command.alias)
    ? command.alias.includes(name)
    : command.alias === name;
}

async function completePath(
  context: CompletionContext,
  token: string
): Promise<string[]> {
  const slash = token.lastIndexOf('/');
  const dirToken = slash === -1 ? '' : token.slice(0, slash + 1);
  const base = dirToken.startsWith('/')
    ? dirToken
    : `${context.cwd}/${dirToken}`;

  try {
    const fs = context.engine.bash.fs;
    const names = await fs.readdir(base.replace(/\/+$/, '') || '/');

    return await Promise.all(
      names.map(async (name) => {
        try {
          const stat = await fs.stat(`${base}/${name}`.replace(/\/{2,}/g, '/'));
          return `${dirToken}${name}${stat.isDirectory ? '/' : ''}`;
        } catch {
          return `${dirToken}${name}`;
        }
      })
    );
  } catch {
    return [];
  }
}

function filter(candidates: string[], token: string): string[] {
  const matches = [...new Set(candidates)].filter((candidate) =>
    candidate.startsWith(token)
  );
  return matches.sort();
}
