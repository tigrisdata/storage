/**
 * Registers the CLI inside just-bash.
 *
 * One command, not seventy: `tigris` hands its argv straight to the browser
 * CLI, which runs the same commander program and the same handlers as the Node
 * binary. Adding a command to `specs.yaml` therefore reaches the shell with no
 * work here.
 *
 * Only `tigris` and `t3` are registered. The shell is a filesystem and the CLI
 * is a program you invoke by name, exactly as in a terminal — so `ls` lists
 * files and `tigris ls` lists buckets, with no third set of rules to learn.
 */

import type { BrowserCli } from '@tigrisdata/cli/browser';
import type { ResolvedCommandContext } from 'just-bash';
import { type Command, defineCommand } from 'just-bash';

export interface TigrisCommandOptions {
  /** Names the CLI answers to. Defaults to `tigris` and `t3`. */
  aliases?: string[];
}

/**
 * just-bash hands stdin to a command as a latin1-shaped byte string — one
 * character per byte. Converted here so `echo hi | tigris objects put …`
 * reaches the CLI as real bytes.
 *
 * An empty stdin is reported as "not piped", so interactive commands still see
 * a TTY and can prompt.
 */
function pipedStdin(
  stdin: ResolvedCommandContext['stdin'] | undefined
): Uint8Array | undefined {
  if (stdin === undefined) return undefined;

  // ByteString is a branded string — one character per byte. just-bash's own
  // `latin1FromBytes` would unwrap it, but that helper is exported from the
  // package root and *not* from its browser entry, so it resolves at
  // typecheck time and is missing at runtime. Unwrap it directly instead.
  const latin1 = stdin as unknown as string;
  if (latin1.length === 0) return undefined;

  return Uint8Array.from(latin1, (char) => char.charCodeAt(0) & 0xff);
}

export function createTigrisCommands(
  cli: BrowserCli,
  options: TigrisCommandOptions = {}
): Command[] {
  const { aliases = ['tigris', 't3'] } = options;

  return aliases.map((alias) =>
    defineCommand(alias, async (args, ctx) => {
      // `cwd` matters: without it a relative path resolves against home rather
      // than wherever `cd` left the user.
      return cli
        .run(args, { stdin: pipedStdin(ctx.stdin), cwd: ctx.cwd })
        .then((result) => ({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          // A streamed download is latin1-shaped bytes, and just-bash must
          // forward it verbatim to a pipe or redirect rather than re-encode
          // it as UTF-8 text.
          stdoutKind: result.stdoutKind,
        }));
    })
  );
}
