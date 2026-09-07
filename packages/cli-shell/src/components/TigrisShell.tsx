import { setAccessKeySession } from '@tigrisdata/cli/browser';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { type CSSProperties, useEffect, useRef } from 'react';

import {
  type Auth0Options,
  auth0Env,
  createAuth0Login,
  discardAuth0Session,
  renewAuth0Session,
  resolveAuth0Config,
  restoreAuth0Session,
} from '../auth/oauth.js';
import { createDeferredIO } from '../repl/io.js';
import { TerminalLoop } from '../repl/loop.js';
import { ShellSession } from '../repl/session.js';
import { ShellEngine } from '../shell.js';

export interface TigrisShellProps {
  /** Auth0 settings for `login`. Defaults target Tigris's own tenant. */
  auth?: Auth0Options;

  /**
   * Sign in with an access key instead of OAuth. Held in memory only — it is
   * written to an in-memory volume that does not survive a reload. It may
   * arrive on a later render, the usual shape when credentials are fetched;
   * it is installed when it does. Removing it does not sign out — `tigris
   * logout` does.
   */
  accessKey?: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
  };

  /** Extra environment variables the CLI can read. */
  env?: Record<string, string>;

  /** Replace the opening banner, or pass false for none. */
  welcome?: string | false;

  /** Called once the shell is live, for imperative access. */
  onReady?: (engine: ShellEngine) => void;

  className?: string;
  style?: CSSProperties;
}

const DEFAULT_THEME = {
  background: '#0e1920',
  foreground: '#d6e2e8',
  cursor: '#62feb5',
  selectionBackground: '#1c3b4a',
};

/**
 * The banner the CLI prints on install (see `packages/cli/postinstall.cjs`,
 * which is the source of truth — it is dependency-free CJS and cannot be
 * imported here). Kept byte-identical so the shell greets you the same way the
 * terminal does, with colour added — minus its two-space indent, which would
 * leave it hanging right of the prompt.
 */
const BANNER = [
  '\x1b[36m┌───────────────────────────────────────────────────────────────────┐\x1b[0m',
  '\x1b[36m│\x1b[0m                                                                   \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m   \x1b[1;32m_____ ___ ___ ___ ___ ___    ___ _    ___\x1b[0m                       \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m  \x1b[1;32m|_   _|_ _/ __| _ \\_ _/ __|  / __| |  |_ _|\x1b[0m                      \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m    \x1b[1;32m| |  | | (_ |   /| |\\__ \\ | (__| |__ | |\x1b[0m                       \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m    \x1b[1;32m|_| |___\\___|_|_\\___|___/  \\___|____|___|\x1b[0m                      \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m                                                                   \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m  To get started:                                                  \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m    $ \x1b[32mtigris login\x1b[0m                                                 \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m                                                                   \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m  For help:                                                        \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m    $ \x1b[32mtigris help\x1b[0m                                                  \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m                                                                   \x1b[36m│\x1b[0m',
  "\x1b[36m│\x1b[0m  Tip - You can use 't3' as a shorthand for 'tigris':              \x1b[36m│\x1b[0m",
  '\x1b[36m│\x1b[0m    $ \x1b[32mt3 login\x1b[0m                                                     \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m                                                                   \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m  Docs: https://www.tigrisdata.com/docs/cli/                       \x1b[36m│\x1b[0m',
  '\x1b[36m│\x1b[0m                                                                   \x1b[36m│\x1b[0m',
  '\x1b[36m└───────────────────────────────────────────────────────────────────┘\x1b[0m',
  '',
].join('\n');

function identityOf(key: NonNullable<TigrisShellProps['accessKey']>): string {
  return [key.accessKeyId, key.secretAccessKey, key.endpoint ?? ''].join('\0');
}

/** Append to a chain of session writes; each runs once the previous settles. */
function enqueue(
  chain: { current: Promise<void> },
  write: () => Promise<unknown>
): Promise<void> {
  const next = chain.current.then(write, write).then(() => undefined);
  chain.current = next.catch(() => undefined);
  return next;
}

export function TigrisShell({
  auth,
  accessKey,
  env,
  welcome,
  onReady,
  className,
  style,
}: TigrisShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Read the latest props without re-creating the terminal on every render.
  const latest = useRef({
    auth,
    accessKey,
    env,
    welcome,
    onReady,
  });
  latest.current = {
    auth,
    accessKey,
    env,
    welcome,
    onReady,
  };

  // What boot or a later render already installed, so an unchanged key is
  // not written again on every render.
  const installedKey = useRef<string | null>(null);

  // Session writes, in order. Restoring a persisted Auth0 session at boot
  // takes a network round trip; an access key that lands meanwhile must be
  // written after it, or the restore's write would win and the shell would
  // run as the OAuth user. The chain also serialises the two boots StrictMode
  // runs in development.
  const sessionWrites = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const props = latest.current;

    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      // The default of 1 makes the banner's underscore-based lettering run
      // into the line below it; real terminals sit nearer 1.2.
      lineHeight: 1.2,
      theme: DEFAULT_THEME,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    const onResize = () => fitAddon.fit();
    window.addEventListener('resize', onResize);

    // The loop owns the IO, and the engine needs the IO, so the IO is taken
    // from the loop after both exist.
    let loop: TerminalLoop | undefined;
    const io = createDeferredIO(() => loop?.io);

    // Declared first so login can read the spec tree; the engine exists by the
    // time it runs.
    let engine: ShellEngine | undefined;

    const auth0 = resolveAuth0Config(props.auth);

    const login = createAuth0Login({
      io,
      specs: () => engine?.cli.specs(),
      ...auth0,
    });

    engine = new ShellEngine({
      io,
      login,
      columns: () => terminal.cols,
      // The CLI must verify ID tokens against the same Auth0 client that
      // minted them; caller-supplied env still wins.
      // Reads `latest.current`, not the effect-time snapshot, so an updated
      // `env` prop reaches the CLI without remounting the terminal.
      env: () => ({ ...auth0Env(auth0), ...latest.current.env }),
      // Without this, `tigris logout` clears the CLI's store but leaves the
      // Auth0 session in localStorage, and a reload signs you back in.
      logout: () => discardAuth0Session(auth0),
      // The CLI cannot refresh OAuth tokens itself in a browser — the SDK
      // holds the refresh token — so its refresh path calls back here.
      refreshSession: () => renewAuth0Session(auth0),
    });

    const session = new ShellSession({ engine });

    loop = new TerminalLoop({ terminal, engine, session });

    // React 18+ StrictMode mounts effects twice in development. Without this
    // guard the first (disposed) terminal would still receive the async
    // credential message.
    let disposed = false;

    const boot = async () => {
      if (props.welcome !== false) {
        io.write(`${props.welcome ?? BANNER}\n`);
      }

      // Installed silently: the CLI does not announce credentials at startup
      // either. `whoami` reports them if you want to know.
      const key = props.accessKey;
      if (key) {
        installedKey.current = identityOf(key);
        await enqueue(sessionWrites, () => setAccessKeySession(key));
      } else {
        // Auth0 persists the session but the CLI's credential store lives on
        // an in-memory volume, so it has to be re-installed after a reload.
        await enqueue(sessionWrites, () => restoreAuth0Session(auth0));
      }
      if (disposed) return;

      // Started only after the async writes land, so the prompt is the last
      // thing on screen rather than having output appended to it.
      loop?.start();
      terminal.focus();
      props.onReady?.(engine);
    };

    void boot();

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      terminal.dispose();
    };
  }, []);

  // An access key that arrives after mount — the usual async-credentials
  // pattern — still has to reach the CLI; the boot path only sees the
  // mount-time props.
  useEffect(() => {
    if (!accessKey) return;
    const identity = identityOf(accessKey);
    if (identity === installedKey.current) return;
    installedKey.current = identity;
    void enqueue(sessionWrites, () => setAccessKeySession(accessKey));
  }, [accessKey]);

  return (
    <div
      ref={containerRef}
      className={['tigris-shell', className].filter(Boolean).join(' ')}
      style={style}
    />
  );
}
