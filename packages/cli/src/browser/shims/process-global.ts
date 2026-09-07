/**
 * Replaces the free `process` identifier inside the browser bundle.
 *
 * Deliberately omits `versions`: `shared/config.ts:isNode()` tests
 * `process.versions.node`, and leaving it undefined keeps `@tigrisdata/storage`
 * and `@tigrisdata/iam` in browser mode, where they resolve no ambient config
 * and rely on the explicit `config` object the CLI already passes everywhere.
 */

import { ExitSignal } from '../exit-signal.js';
import { getHost, hasHost } from '../host.js';
import { writeErr, writeOut, writeOutBytes } from '../output.js';
import { getWorkingDirectory, hasStdin, readStdin } from '../stdin.js';

function columns(): number {
  return (hasHost() ? getHost().columns : undefined) ?? 120;
}

/**
 * Enough of a Writable to be written to, piped into and ended.
 *
 * `stream.pipeline()` into stdout does not go through here: readable-stream
 * never ends `process.stdout`, so the `node:stream/promises` shim drains the
 * source itself. The events exist for direct `pipe()`/`end()` callers, which
 * would otherwise wait forever for a `finish` that never fires.
 */
function writableFacade(
  sink: (chunk: string) => void,
  sinkBytes: (chunk: Uint8Array) => void = (chunk) =>
    sink(new TextDecoder().decode(chunk))
) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };

  const facade = {
    writable: true,
    write(chunk: string | Uint8Array) {
      // Bytes stay bytes: decoding a streamed download as UTF-8 replaces
      // every byte that is not valid text and corrupts the object.
      if (typeof chunk === 'string') sink(chunk);
      else sinkBytes(chunk);
      return true;
    },
    end(chunk?: string | Uint8Array) {
      if (chunk !== undefined) facade.write(chunk);
      // Deferred so a listener attached after `end()` still sees them.
      queueMicrotask(() => {
        emit('finish');
        emit('close');
      });
      return facade;
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
      return facade;
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      const wrapped = (...args: unknown[]) => {
        facade.removeListener(event, wrapped);
        listener(...args);
      };
      return facade.on(event, wrapped);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(
        event,
        existing.filter((candidate) => candidate !== listener)
      );
      return facade;
    },
    emit,
    destroy() {
      return facade;
    },
  };

  return facade;
}

const stdout = Object.assign(writableFacade(writeOut, writeOutBytes), {
  // `utils/messages.ts` suppresses every printStart/Success/Empty/Hint when
  // this is falsy. A browser terminal *is* a TTY, and without this the shell
  // renders mute.
  isTTY: true,
  get columns() {
    return columns();
  },
  rows: 40,
});

const stderr = Object.assign(writableFacade(writeErr), {
  isTTY: true,
  get columns() {
    return columns();
  },
  rows: 40,
});

// Interactive by default so `requireInteractive()` passes — but not when the
// shell piped data in, because the CLI reads `!isTTY` as "I was piped to".
const stdin = {
  get isTTY() {
    return !hasStdin();
  },
  setEncoding: () => stdin,
  on: () => stdin,
  once: () => stdin,
  removeListener: () => stdin,
  resume: () => stdin,
  pause: () => stdin,
  [Symbol.asyncIterator]: async function* () {
    if (hasStdin()) yield readStdin();
  },
};

export const process = {
  get env(): Record<string, string> {
    return (hasHost() ? getHost().env : undefined) ?? {};
  },
  argv: ['/usr/local/bin/tigris', 'tigris'],
  platform: 'linux',
  arch: 'x64',
  version: 'v20.0.0',
  execPath: '/usr/local/bin/tigris',
  stdout,
  stderr,
  stdin,
  // Follows the shell's cwd, so relative paths resolve where the user is.
  cwd: () => getWorkingDirectory(),
  exit: (code = 0): never => {
    throw new ExitSignal(code);
  },
  on: () => process,
  once: () => process,
  off: () => process,
  removeListener: () => process,
  emit: () => false,
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => fn(...args));
  },
};

export default process;
