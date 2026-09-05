/**
 * The shell engine: a just-bash environment with Tigris CLI inside it.
 *
 * The filesystem is the CLI's own memfs volume, so `~/.tigris/config.json`
 * written by `tigris login` is readable with `cat`, and a file created with
 * `echo` can be handed to `tigris objects put`.
 *
 * Buckets are deliberately not mounted as directories. The CLI has no such
 * concept, so presenting one here would mean a second, weaker way to reach
 * object storage — with its own caching, pagination and glob semantics to
 * explain. `tigris ls` and `tigris objects list` are the way to browse.
 *
 * Commands are bash builtins plus `tigris` and `t3`. CLI commands are not
 * aliased bare: the shell is a filesystem, and the CLI is a program you invoke
 * by name — so `ls` lists files and `tigris ls` lists buckets.
 */

import {
  type BrowserCli,
  fs as cliFs,
  volume as cliVolume,
  createBrowserCli,
  HOME_DIR,
} from '@tigrisdata/cli/browser';
import { Bash, type BashExecResult } from 'just-bash';

import { createTigrisCommands } from './commands/tigris.js';
import {
  type MemfsLike,
  VolumeAdapter,
  type VolumeLike,
} from './fs/volume-adapter.js';
import { createReplHost } from './repl/host.js';
import type { ReplIO } from './repl/io.js';

export interface ShellEngineOptions {
  io: ReplIO;
  /** Runs interactive login (Auth0 SPA popup, typically). */
  login?: () => Promise<void>;
  /** Terminal width, for table formatting. */
  columns?: () => number;
  /** Environment the CLI sees — where access-key credentials are injected. */
  env?: () => Record<string, string>;
  /** Discards the host's own session on `tigris logout`. */
  logout?: () => Promise<void>;
  /** Renews the OAuth session when the CLI asks — see BrowserHost.refreshSession. */
  refreshSession?: () => Promise<void>;
  cwd?: string;
}

export class ShellEngine {
  readonly bash: Bash;
  readonly cli: BrowserCli;

  constructor(options: ShellEngineOptions) {
    this.cli = createBrowserCli(
      createReplHost({
        io: options.io,
        ...(options.login ? { login: options.login } : {}),
        ...(options.columns ? { columns: options.columns } : {}),
        ...(options.env ? { env: options.env } : {}),
        ...(options.logout ? { logout: options.logout } : {}),
        ...(options.refreshSession
          ? { refreshSession: options.refreshSession }
          : {}),
      })
    );

    this.bash = new Bash({
      fs: new VolumeAdapter(
        cliFs as unknown as MemfsLike,
        cliVolume as unknown as VolumeLike
      ),
      cwd: options.cwd ?? HOME_DIR,
      // The CLI keeps its config under `os.homedir()`; bash must agree, or
      // `~` and a bare `cd` go to just-bash's own home (`/`) and
      // `cat ~/.tigris/config.json` finds nothing.
      env: { HOME: HOME_DIR },
      // just-bash's defense-in-depth blocks `process` access, which the CLI's
      // own process shim relies on. We enable neither js-exec nor python, so
      // the sandbox buys nothing here.
      defenseInDepth: false,
      customCommands: createTigrisCommands(this.cli),
    });
  }

  /** Run one command line. `PWD` is read back so `cd` persists across calls. */
  exec(line: string, cwd?: string): Promise<BashExecResult> {
    return this.bash.exec(line, cwd ? { cwd } : {});
  }
}
