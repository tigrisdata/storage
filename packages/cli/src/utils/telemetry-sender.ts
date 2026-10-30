import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { isBinaryBuild } from './install-method.js';

/**
 * Delivery for both telemetry surfaces: usage analytics (analytics.ts) and
 * error reports (telemetry.ts). Neither one does network I/O in the CLI
 * process. They queue ready-to-send requests here, and when the command ends
 * the queue is written to a private temp file and handed to a detached copy of
 * the CLI (`tigris __telemetry-send <file>`), which posts it after this process
 * has already exited. A command never waits on the network to finish.
 *
 * `__telemetry-send` is internal: the entry points (cli.ts, cli-binary.ts)
 * branch on it before the commander program exists, so it is never listed in
 * help and never initializes telemetry itself.
 *
 * If the child cannot be started (unwritable temp dir, a sandbox that forbids
 * spawning), the queue is posted from this process instead, unawaited and
 * capped at FALLBACK_TIMEOUT_MS. That survives a command that returns
 * normally, but not a process.exit() or a send queued from the 'exit' event,
 * so in those restricted environments some events are still lost.
 */

/** argv[2] that turns the CLI into the sender. */
export const TELEMETRY_SEND_COMMAND = '__telemetry-send';

/** Temp file name prefix; the child refuses any file not named like this. */
export const PAYLOAD_FILE_PREFIX = 'tigris-telemetry-';

/** Per-request budget in the detached child. Nobody is waiting on it. */
const CHILD_TIMEOUT_MS = 5000;

/**
 * Per-request budget for the in-process fallback, which can hold a returning
 * command open. Ordinary offline failures (DNS, refused) end long before it.
 */
const FALLBACK_TIMEOUT_MS = 1000;

/** One POST, fully prepared: the child knows nothing about either service. */
export interface TelemetryRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const queue: TelemetryRequest[] = [];
let exitListener: (() => void) | null = null;

/**
 * Queue a request for the end of the run. The first one also arranges for
 * anything still queued at exit to go out, which covers sends nobody flushes
 * explicitly (an error report with no tracked command, a late `$identify`).
 */
export function queueTelemetry(request: TelemetryRequest): void {
  queue.push(request);
  if (!exitListener) {
    exitListener = () => sendQueuedTelemetry();
    process.on('exit', exitListener);
  }
}

/** Send everything queued so far. Synchronous, never throws, never waits. */
export function sendQueuedTelemetry(): void {
  if (queue.length === 0) {
    return;
  }
  const batch = queue.splice(0);
  try {
    spawnSender(batch, () => sendInProcess(batch));
  } catch {
    // Telemetry must never affect the CLI.
  }
}

function sendInProcess(batch: TelemetryRequest[]): void {
  for (const request of batch) {
    void post(request, FALLBACK_TIMEOUT_MS);
  }
}

/**
 * How to re-launch this CLI as the sender. The compiled binary is its own
 * executable; under Node it is Node plus the entry script the user ran
 * (argv[1]). Node flags in execArgv are deliberately not passed on, so an
 * `--inspect` run does not start a second debugger.
 */
export function senderCommand(file: string): [string, string[]] | null {
  if (isBinaryBuild()) {
    return [process.execPath, [TELEMETRY_SEND_COMMAND, file]];
  }
  const entry = process.argv[1];
  return entry
    ? [process.execPath, [entry, TELEMETRY_SEND_COMMAND, file]]
    : null;
}

function removeFile(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // Already gone.
  }
}

/**
 * Write the batch to a fresh 0600 file and start the detached sender on it.
 * Calls `fallback` (once) if the child cannot be started, after removing the
 * file so nothing is left behind.
 */
function spawnSender(batch: TelemetryRequest[], fallback: () => void): void {
  const file = join(
    tmpdir(),
    `${PAYLOAD_FILE_PREFIX}${process.pid}-${randomBytes(8).toString('hex')}.json`
  );
  const command = senderCommand(file);
  if (!command) {
    fallback();
    return;
  }

  let failed = false;
  const fail = () => {
    if (!failed) {
      failed = true;
      removeFile(file);
      fallback();
    }
  };

  try {
    // `wx`: never follow or reuse an existing path.
    writeFileSync(file, JSON.stringify(batch), { mode: 0o600, flag: 'wx' });
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    // A spawn that fails reports it asynchronously; a missing pid says so now.
    child.on('error', fail);
    if (child.pid === undefined) {
      fail();
      return;
    }
    child.unref();
  } catch {
    fail();
  }
}

/**
 * POST one request. Resolves on any outcome (response, error, timeout,
 * malformed URL) and never throws. http is accepted only so a local PostHog or
 * Sentry can be pointed at via env overrides; the shipped hosts are https.
 */
export function post(
  request: TelemetryRequest,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    // Node's `timeout` option is socket inactivity, not elapsed time: a
    // connection that stalls before connecting or a response that trickles
    // small chunks can outlive it. A wall-clock timer caps the whole request.
    let settled = false;
    let deadline: NodeJS.Timeout | undefined;
    let req: ReturnType<typeof httpsRequest> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      resolve();
    };
    try {
      deadline = setTimeout(() => {
        req?.destroy();
        done();
      }, timeoutMs);
      deadline.unref?.();
      const url = new URL(request.url);
      const send = url.protocol === 'http:' ? httpRequest : httpsRequest;
      req = send(
        url,
        {
          method: 'POST',
          timeout: timeoutMs,
          headers: {
            ...request.headers,
            'content-length': Buffer.byteLength(request.body),
          },
        },
        (res) => {
          // Drain so the socket can close; the status changes nothing.
          res.resume();
          res.on('end', done);
          res.on('error', done);
        }
      );
      req.on('error', done);
      req.on('timeout', () => {
        req?.destroy();
        done();
      });
      req.end(request.body);
    } catch {
      done();
    }
  });
}

function isTelemetryRequest(value: unknown): value is TelemetryRequest {
  const v = value as Partial<TelemetryRequest> | null;
  return (
    typeof v?.url === 'string' &&
    /^https?:\/\//.test(v.url) &&
    typeof v.body === 'string' &&
    v.headers !== null &&
    typeof v.headers === 'object'
  );
}

/**
 * The `__telemetry-send` handler, run in the detached child. Reads and deletes
 * the payload file, posts each request, and resolves. Prints nothing and
 * swallows every error: there is no one to tell.
 */
export async function runTelemetrySender(
  file: string | undefined
): Promise<void> {
  try {
    // Only ever read (and delete) a payload file the parent wrote.
    if (
      !file ||
      resolve(dirname(file)) !== resolve(tmpdir()) ||
      !basename(file).startsWith(PAYLOAD_FILE_PREFIX)
    ) {
      return;
    }
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } finally {
      removeFile(file);
    }
    const batch: unknown = JSON.parse(raw);
    if (!Array.isArray(batch)) {
      return;
    }
    await Promise.all(
      batch
        .filter(isTelemetryRequest)
        .map((request) => post(request, CHILD_TIMEOUT_MS))
    );
  } catch {
    // Nothing to report to.
  }
}

/** Test seam: drop anything queued and the exit listener. */
export function resetTelemetryQueueForTesting(): void {
  queue.length = 0;
  if (exitListener) {
    process.removeListener('exit', exitListener);
    exitListener = null;
  }
}
