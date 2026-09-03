/**
 * Browser entry point for Tigris CLI.
 *
 * Runs the *same* commander program and the *same* `src/lib` handlers as the
 * Node CLI, driven by the same `specs.yaml`. The differences are confined to
 * the build: node builtins are aliased to the shims in `./shims`, and the free
 * `process` and `console` identifiers are replaced at bundle time so
 * `process.exit()` becomes a catchable throw and output is captured instead of
 * being written to a terminal.
 *
 * @example
 * ```ts
 * import { createBrowserCli, volume } from '@tigrisdata/cli/browser';
 *
 * const cli = createBrowserCli({
 *   confirm: (message) => terminal.confirm(message),
 *   input: (message, options) => terminal.input(message, options),
 *   select: (message, choices) => terminal.select(message, choices),
 *   login: () => auth0Login(),
 * });
 *
 * const { stdout, exitCode } = await cli.run(['objects', 'list', 'my-bucket']);
 * ```
 */

import * as YAML from 'yaml';

import { version } from '../../package.json';
import { setExternalTokenRefresher } from '../auth/client.js';
import { resetAutoLogin } from '../auth/provider.js';
import { getTokens } from '../auth/storage.js';
import {
  createProgram,
  type ImplementationChecker,
  type ModuleLoader,
} from '../cli-core.js';
// esbuild is configured with `loader: { '.yaml': 'text' }`, so this is the
// file's contents as a string (the bun binary build uses an import attribute).
import specsYaml from '../specs.yaml';
import type { Specs } from '../types.js';
import { setSpecs } from '../utils/specs.js';
import { browserCommandRegistry } from './command-registry.generated.js';
import { ExitSignal, isExitSignal } from './exit-signal.js';
import { type BrowserHost, getHost, hasHost, setHost } from './host.js';
import { setRunInterrupter } from './interrupt.js';
import { beginCapture, endCapture, writeErr, writeOut } from './output.js';
import { setStdin, setWorkingDirectory } from './stdin.js';

export { ExitSignal, isExitSignal } from './exit-signal.js';
export type { BrowserHost, SelectChoice } from './host.js';
export {
  type AccessKeySession,
  clearSession,
  getSessionConfig,
  getSessionState,
  type OAuthSession,
  type RenewedTokens,
  renewOAuthSession,
  type SessionState,
  setAccessKeySession,
  setOAuthSession,
  type TigrisStorageConfig,
} from './session.js';
export { fs, HOME_DIR, resetVolume, volume } from './volume.js';

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /**
   * `'bytes'` when the command streamed binary to stdout — `stdout` is then a
   * latin1 string (one char per byte) to be forwarded verbatim. Otherwise
   * `'text'`.
   */
  stdoutKind: 'text' | 'bytes';
}

export interface RunOptions {
  /**
   * Bytes piped into this invocation. Providing it makes `process.stdin.isTTY`
   * false, which is how the CLI detects piped input (`objects put`, `bundle`).
   */
  stdin?: Uint8Array;

  /** Directory to run in, so relative paths resolve as the user expects. */
  cwd?: string;
}

export interface BrowserCli {
  run(argv: string[], options?: RunOptions): Promise<CliResult>;
  /** Command paths available in this build, e.g. `['objects/list', ...]`. */
  commands(): string[];
  /** The parsed command tree, for help text and tab completion. */
  specs(): Specs;
}

const specs: Specs = YAML.parse(specsYaml, { schema: 'core' });

// Prime the shared cache so handlers' msg()/getCommandSpec() resolve without
// touching the filesystem — the same seam the bun binary build uses.
setSpecs(specs);

// The CLI refreshes an expiring OAuth token by posting a refresh token, which
// it does not hold here: Auth0's SPA SDK keeps refresh tokens in its own
// cache. Route that refresh to the host, which renews through the SDK and
// installs the result; the CLI then reads the fresh tokens back.
setExternalTokenRefresher(async () => {
  if (!hasHost()) return null;
  const host = getHost();
  if (!host.refreshSession) return null;

  await host.refreshSession();
  return getTokens();
});

const hasImplementation: ImplementationChecker = (commandPath) =>
  commandPath.join('/') in browserCommandRegistry;

const loadModule: ModuleLoader = async (commandPath) => {
  const key = commandPath.join('/');
  const module = browserCommandRegistry[key];

  if (module) {
    return { module, error: null };
  }

  return {
    module: null,
    error: `Command not available in the browser: ${commandPath.join(' ')}`,
  };
};

/** commander only inherits some settings, so apply these across the tree. */
function harnessProgram(command: {
  exitOverride: (fn: (error: { exitCode: number }) => never) => unknown;
  configureOutput: (config: Record<string, unknown>) => unknown;
  commands: unknown[];
}): void {
  command.exitOverride((error) => {
    throw new ExitSignal(error.exitCode ?? 1);
  });
  command.configureOutput({
    // Help and usage text go through commander's own writers, not console.
    writeOut,
    writeErr,
    outputError: (text: string, write: (value: string) => void) => write(text),
  });

  for (const child of command.commands) {
    harnessProgram(child as Parameters<typeof harnessProgram>[0]);
  }
}

export function createBrowserCli(host: BrowserHost): BrowserCli {
  return {
    commands: () => Object.keys(browserCommandRegistry).sort(),
    specs: () => specs,

    async run(argv: string[], options?: RunOptions): Promise<CliResult> {
      // The re-entrancy guard goes first: installing host/stdin/cwd before it
      // would clobber an in-flight run's state and *then* reject.
      beginCapture();
      setHost(host);
      setStdin(options?.stdin ?? null);
      setWorkingDirectory(options?.cwd ?? null);

      // `loadAndExecuteCommand` sets this and never clears it; without a reset
      // one `--json` run would leave every later run in JSON mode.
      globalThis.__TIGRIS_JSON_MODE = false;

      // Same shape of problem: the auto-login latch is per-process, and a
      // browser process is the whole page.
      resetAutoLogin();

      let exitCode = 0;

      try {
        const program = createProgram({
          specs,
          version,
          loadModule,
          hasImplementation,
        });
        harnessProgram(
          program as unknown as Parameters<typeof harnessProgram>[0]
        );

        // A prompt cancelled with Ctrl+C ends the run the way SIGINT ends the
        // Node process: the handler awaiting the answer is abandoned, not
        // resumed with an empty answer it would read as "no".
        const interrupted = new Promise<never>((_, reject) => {
          setRunInterrupter(reject);
        });
        await Promise.race([
          program.parseAsync(argv, { from: 'user' }),
          interrupted,
        ]);
      } catch (error) {
        if (isExitSignal(error)) {
          exitCode = error.exitCode;
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          writeErr(`${message}\n`);
          exitCode = 1;
        }
      } finally {
        setRunInterrupter(null);
        globalThis.__TIGRIS_JSON_MODE = false;
        setStdin(null);
        setWorkingDirectory(null);
        setHost(null);
      }

      const { stdout, stderr, stdoutKind } = endCapture();
      return { stdout, stderr, stdoutKind, exitCode };
    },
  };
}
