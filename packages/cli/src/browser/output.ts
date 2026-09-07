/**
 * Output capture for one CLI invocation.
 *
 * The CLI writes results with bare `console.log` from ~250 call sites and has no
 * output-sink abstraction. Rather than refactor those (which would mean touching
 * every handler and risking the shipping Node CLI), the browser build swaps the
 * `console` and `process.stdout` identifiers at bundle time via esbuild `inject`
 * and funnels everything here.
 *
 * Substitution happens inside the bundle only, so the embedding page's own
 * `console` is untouched.
 *
 * Everything is captured as bytes. Text is UTF-8 encoded on the way in, so a
 * download that `objects get` streams to stdout arrives intact rather than
 * being decoded as text and having every non-UTF-8 byte replaced.
 */

let stdout: Uint8Array[] = [];
let stderr: Uint8Array[] = [];
let sawBinary = false;
let capturing = false;

const encoder = new TextEncoder();

export function beginCapture(): void {
  if (capturing) {
    throw new Error(
      'runCli() is not re-entrant: a command is already running.'
    );
  }
  capturing = true;
  stdout = [];
  stderr = [];
  sawBinary = false;
}

export interface CapturedOutput {
  stdout: string;
  stderr: string;
  /**
   * `'bytes'` when anything binary was written: `stdout` is then a latin1
   * string (one char per byte), the shape just-bash forwards verbatim to a
   * pipe or redirect. Otherwise `'text'` and `stdout` is decoded UTF-8.
   */
  stdoutKind: 'text' | 'bytes';
}

export function endCapture(): CapturedOutput {
  const result: CapturedOutput = {
    stdout: sawBinary ? toLatin1(concat(stdout)) : toText(concat(stdout)),
    stderr: toText(concat(stderr)),
    stdoutKind: sawBinary ? 'bytes' : 'text',
  };
  capturing = false;
  stdout = [];
  stderr = [];
  sawBinary = false;
  return result;
}

export function writeOut(text: string): void {
  stdout.push(encoder.encode(text));
}

/** Raw bytes — a streamed download, not something to decode. */
export function writeOutBytes(bytes: Uint8Array): void {
  sawBinary = true;
  stdout.push(bytes);
}

export function writeErr(text: string): void {
  stderr.push(encoder.encode(text));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** One char per byte, so no byte is altered on the way out. */
function toLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

/** Format console-style varargs the way Node's console does for simple values. */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack ?? arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/**
 * Replaces the free `console` identifier inside the bundle.
 * Only `log`, `error` and `warn` are reached by CLI source, but the rest are
 * provided so any dependency that reaches for them does not crash.
 */
export const console = {
  log: (...args: unknown[]) => writeOut(`${formatArgs(args)}\n`),
  info: (...args: unknown[]) => writeOut(`${formatArgs(args)}\n`),
  debug: (...args: unknown[]) => writeOut(`${formatArgs(args)}\n`),
  error: (...args: unknown[]) => writeErr(`${formatArgs(args)}\n`),
  warn: (...args: unknown[]) => writeErr(`${formatArgs(args)}\n`),
  trace: (...args: unknown[]) => writeErr(`${formatArgs(args)}\n`),
  table: (...args: unknown[]) => writeOut(`${formatArgs(args)}\n`),
  group: () => {},
  groupEnd: () => {},
  dir: (...args: unknown[]) => writeOut(`${formatArgs(args)}\n`),
  assert: () => {},
  time: () => {},
  timeEnd: () => {},
  count: () => {},
};
