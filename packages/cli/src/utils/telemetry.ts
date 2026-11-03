import { release } from 'node:os';
import type { ErrorEvent, NodeOptions } from '@sentry/node';
import { version } from '../../package.json';
import { SENTRY_DSN } from '../constants.js';
import type { ErrorCategory } from './errors.js';
import { redactSecrets, scrubArgv } from './redact.js';
import { isTelemetryDisabled } from './telemetry-config.js';
import { queueTelemetry } from './telemetry-sender.js';

/**
 * Error telemetry (Sentry) for the CLI.
 *
 * Reports true crashes plus unexpected ("general") and network failures so we
 * can debug customer issues. Expected, user-facing conditions (auth,
 * permission, not_found, rate_limit) are intentionally not reported — they are
 * noise, not bugs.
 *
 * Telemetry is a strict no-op unless a DSN is configured, and stays disabled in
 * dev/test and whenever the user opts out (the shared gate lives in
 * telemetry-config.ts and covers usage analytics too). It must never change the
 * CLI's behavior or throw into the command path.
 *
 * The SDK is loaded only when telemetry is on, and asynchronously: a user who
 * opted out never loads it, and a runtime the SDK refuses to run on (it wants
 * Node 20.19 or later) gets a CLI without error reporting rather than no CLI.
 *
 * Nothing here touches the network: envelopes go through makeQueuedTransport
 * to the detached sender (telemetry-sender.ts), which posts them after the CLI
 * has exited.
 */

type SentryModule = typeof import('@sentry/node');

// Categories worth reporting for a handled (failWithError) exit. Crashes are
// always reported regardless of category.
const REPORTABLE_CATEGORIES: ReadonlySet<ErrorCategory> =
  new Set<ErrorCategory>(['general', 'network']);

/**
 * off: never requested (no DSN, opted out, or not initialized yet).
 * loading: the SDK import is in flight; reports queue up meanwhile.
 * on: configured and reporting. failed: the SDK could not load or start.
 */
type State = 'off' | 'loading' | 'on' | 'failed';

let initialized = false;
let state: State = 'off';
/** The SDK once configured; only set while `state` is `on`. */
let sentry: SentryModule | undefined;
/** Settles once the SDK is configured or has failed; awaited by flush. */
let loading: Promise<void> | undefined;
/** Reports made while the SDK was loading, replayed once it is up. */
const pending: Array<(sdk: SentryModule) => void> = [];
const MAX_PENDING = 20;

/**
 * DSN resolution: explicit env override (staging / self-hosted) wins, otherwise
 * the DSN embedded at build time. A Sentry DSN is not a secret — it only allows
 * sending events — so embedding it in the published CLI is expected. Empty
 * string keeps telemetry inert until a project exists.
 */
function resolveDsn(): string {
  return process.env.TIGRIS_SENTRY_DSN?.trim() || SENTRY_DSN;
}

const environment =
  process.env.TIGRIS_ENV === 'development' ? 'development' : 'production';

// The redaction policy lives in redact.ts so error reports and usage analytics
// share exactly one implementation. Re-exported here because this module's
// public surface (and its tests) have always exposed them.
export { redactSecrets, scrubArgv };

/** The top-level command name (first non-flag arg), used as a searchable tag. */
export function invocationCommand(argv: string[]): string | undefined {
  const first = argv[0];
  return first && !first.startsWith('-') ? first : undefined;
}

// Sentry default integrations we deliberately drop:
// - OnUncaughtException / OnUnhandledRejection: we own process exit ourselves.
// - LocalVariables(Async): captures local variable values (e.g. credentials)
//   into stack frames, which beforeSend does not scrub.
// - Console / ChildProcess: record breadcrumbs that can carry user data
//   (printed output, spawned command lines).
// - ProcessSession: sends a release-health session from a 'beforeExit'
//   listener, which held every naturally exiting command open for a TLS round
//   trip (~300ms) and never ran on process.exit() anyway.
// - Context / ContextLines: gather OS details and source lines asynchronously,
//   so an error captured right before process.exit() was still being
//   processed when the process ended. Without them capture is synchronous; the
//   OS release is set in configure() instead, and source lines of the minified
//   bundle say little.
export const DISABLED_INTEGRATIONS: ReadonlySet<string> = new Set([
  'OnUncaughtException',
  'OnUnhandledRejection',
  'LocalVariables',
  'LocalVariablesAsync',
  'Console',
  'ChildProcess',
  'ProcessSession',
  'Context',
  'ContextLines',
]);

/** The SDK's default integrations minus DISABLED_INTEGRATIONS. */
export function selectIntegrations<T extends { name: string }>(
  defaults: T[]
): T[] {
  return defaults.filter((i) => !DISABLED_INTEGRATIONS.has(i.name));
}

/**
 * What the SDK may collect on its own. Since Sentry 11 it gathers user info,
 * HTTP headers and bodies, query strings and stack-frame locals unless told
 * otherwise; none of that belongs in a CLI crash report, and beforeSend was
 * never written to scrub it. This keeps collection where `sendDefaultPii:
 * false` had it, minus locals, which we drop the integration for anyway.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<NodeOptions['dataCollection']>;

type TransportOptions = Parameters<SentryModule['makeNodeTransport']>[0];
type Transport = ReturnType<SentryModule['makeNodeTransport']>;

/**
 * A transport that never touches the network: each envelope is queued for the
 * detached sender (telemetry-sender.ts), which posts it to the DSN's envelope
 * endpoint after the CLI exits. Events reach it already scrubbed by
 * beforeSend. Takes the SDK's createTransport so this module can keep the SDK
 * itself out of its static imports.
 */
export function makeQueuedTransport(
  createTransport: SentryModule['createTransport']
): (options: TransportOptions) => Transport {
  return (options) => {
    const endpoint = new URL(options.url);
    // The SDK puts auth in the query string; send it as the header instead.
    const key = endpoint.searchParams.get('sentry_key') ?? '';
    endpoint.search = '';
    const headers = {
      'content-type': 'application/x-sentry-envelope',
      'user-agent': `tigris-cli/${version}`,
      'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=tigris-cli/${version}`,
    };
    return createTransport(options, (request) => {
      queueTelemetry({
        url: endpoint.href,
        headers,
        body:
          typeof request.body === 'string'
            ? request.body
            : Buffer.from(request.body).toString('utf8'),
      });
      return Promise.resolve({});
    });
  };
}

/**
 * Recursively redact every string value in a value tree. Sentry events are
 * plain JSON (no cycles), so a straightforward walk is safe. Non-string leaves
 * (numbers, booleans, null) are returned unchanged.
 */
function deepRedact(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map(deepRedact);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      obj[key] = deepRedact(obj[key]);
    }
    return obj;
  }
  return value;
}

/**
 * Final scrub before an event leaves the process: drop the machine hostname and
 * recursively redact credentials/PII from every string field. This covers not
 * just exception values and messages but also structured breadcrumb `data`
 * (e.g. request URLs) and any other field a default integration may attach.
 */
export function beforeSend(event: ErrorEvent): ErrorEvent {
  event.server_name = undefined;
  return deepRedact(event) as ErrorEvent;
}

/**
 * Initialize telemetry. Idempotent, and a no-op when disabled or unconfigured.
 * Called once from setupErrorHandlers() before the program runs. Returns at
 * once; the SDK finishes loading in the background and reports made in the
 * meantime are replayed.
 */
export function initTelemetry(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  const dsn = resolveDsn();
  if (!dsn || isTelemetryDisabled()) {
    return;
  }

  state = 'loading';
  loading = import('@sentry/node')
    .then((sdk) => configure(sdk, dsn))
    .catch(() => {
      // Never let telemetry setup break the CLI.
      state = 'failed';
      pending.length = 0;
    });
}

function configure(sdk: SentryModule, dsn: string): void {
  sdk.init({
    dsn,
    release: `@tigrisdata/cli@${version}`,
    environment,
    // Error reporting only — no performance tracing.
    tracesSampleRate: 0,
    dataCollection: DATA_COLLECTION,
    // Drop integrations that fight our exit handling, delay capture, or
    // capture user data we don't scrub. See DISABLED_INTEGRATIONS.
    integrations: selectIntegrations,
    beforeSend,
    // Delivered by the detached sender; see makeQueuedTransport.
    transport: makeQueuedTransport(sdk.createTransport),
    // Client reports would add an envelope to otherwise clean runs.
    sendClientReports: false,
    // The module hooks exist for instrumenting third-party packages, which
    // this CLI does not do. (Sentry 10 called this registerEsmLoaderHooks.)
    enableRuntimeChannelInjection: false,
  });

  sdk.setContext('cli', {
    version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    os_release: release(),
  });
  // The full command with credentials and PII (access keys, tokens, emails,
  // names) redacted. Kept for debugging; identifies the command on the crash
  // path too, where there is no MessageContext.
  const argv = process.argv.slice(2);
  sdk.setContext('invocation', {
    command: scrubArgv(argv).join(' '),
  });
  // Searchable tag for the top-level command (a fixed CLI keyword, not data).
  const command = invocationCommand(argv);
  if (command) {
    sdk.setTag('command', command);
  }

  sentry = sdk;
  state = 'on';
  for (const report of pending.splice(0)) {
    report(sdk);
  }
}

/**
 * Report an error. Crashes are always reported; handled exits are reported only
 * for the categories we care about. No-op when telemetry is disabled.
 *
 * Once the SDK is up, capture is synchronous: the envelope is in the sender
 * queue before this returns, so a process.exit() right after still delivers it.
 * While the SDK is still loading the report is queued (bounded) and replayed
 * once it is up — best effort on the synchronous exit path, which cannot wait.
 */
export function captureError(
  error: unknown,
  opts: {
    category?: ErrorCategory;
    command?: string;
    crash?: boolean;
    exitCode?: number;
  } = {}
): void {
  if (state === 'off' || state === 'failed') {
    return;
  }

  const { category, command, crash, exitCode } = opts;
  if (!crash && category && !REPORTABLE_CATEGORIES.has(category)) {
    return;
  }

  const report = (sdk: SentryModule) => {
    try {
      sdk.captureException(error, (scope) => {
        scope.setTag('crash', crash === true);
        if (category) {
          scope.setTag('error.category', category);
        }
        if (command) {
          scope.setTag('command', command);
        }
        if (exitCode !== undefined) {
          scope.setTag('exit_code', exitCode);
        }
        return scope;
      });
    } catch {
      // Telemetry must never break the CLI.
    }
  };

  if (sentry) {
    report(sentry);
  } else if (pending.length < MAX_PENDING) {
    pending.push(report);
  }
}

/**
 * Wait until every captured event has been handed to the sender queue
 * (bounded; no network I/O happens here, the detached sender posts after
 * exit). Awaitable, and a no-op when telemetry is disabled. Used by the global
 * crash handlers before they exit: awaiting `loading` lets a crash reported
 * while the SDK was still loading be replayed into the transport, so it is
 * queued before process.exit() hands the queue to the sender.
 */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  if (state === 'off' || state === 'failed') {
    return;
  }
  try {
    // The import is local, but a wedged one must not hold a crash open.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      loading,
      new Promise<void>((done) => {
        timer = setTimeout(done, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (sentry) {
      await sentry.flush(timeoutMs);
    }
  } catch {
    // Never let telemetry break the CLI.
  }
}
