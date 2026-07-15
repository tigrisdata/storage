import type { ExecResult } from 'just-bash';

/** Format a usage error. The `usage` line is appended on the next line if given. */
export function argError(
  cmd: string,
  message: string,
  usage?: string
): ExecResult {
  const usageLine = usage ? `Usage: ${usage}\n` : '';
  return {
    stdout: '',
    stderr: `${cmd}: ${message}\n${usageLine}`,
    exitCode: 1,
  };
}

/** Format an SDK error consistently across commands. */
export function sdkError(cmd: string, err: { message: string }): ExecResult {
  return { stdout: '', stderr: `${cmd}: ${err.message}\n`, exitCode: 1 };
}

export type FlagSchema = Record<string, 'boolean' | 'value'>;

export interface FlagParseResult {
  flags: Record<string, string | true>;
  positional: string[];
}

/**
 * Parse a flag-and-positional argv. Returns either the parsed result or an
 * error describing an unknown option or a missing value. Does not allow
 * `--flag=value` syntax — values are taken from the following arg.
 */
export function parseFlags(
  args: string[],
  schema: FlagSchema
): FlagParseResult | { error: string } {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const kind = schema[arg];
    if (kind === undefined) {
      return { error: `unknown option: ${arg}` };
    }
    if (kind === 'boolean') {
      flags[arg] = true;
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { error: `option ${arg} requires a value` };
    }
    flags[arg] = value;
    i++;
  }

  return { flags, positional };
}
