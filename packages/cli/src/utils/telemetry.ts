import type { ErrorEvent, NodeOptions } from '@sentry/node';
import { version } from '../../package.json';
import { SENTRY_DSN } from '../constants.js';
import type { ErrorCategory } from './errors.js';
import { redactSecrets, scrubArgv } from './redact.js';
import { isTelemetryDisabled } from './telemetry-config.js';

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
export const DISABLED_INTEGRATIONS: ReadonlySet<string> = new Set([
  'OnUncaughtException',
  'OnUnhandledRejection',
  'LocalVariables',
  'LocalVariablesAsync',
  'Console',
  'ChildProcess',
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
    // Drop integrations that either fight our exit handling or capture user
    // data we don't scrub (local variables, console/child-process
    // breadcrumbs). See DISABLED_INTEGRATIONS.
    integrations: selectIntegrations,
    beforeSend,
  });

  sdk.setContext('cli', {
    version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
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
 * for the categories we care about. No-op when telemetry is disabled. While the
 * SDK is still loading the report is queued (bounded) and sent once it is up —
 * best effort, like every report on the synchronous exit path.
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
 * Flush any queued events (best effort, bounded). Awaitable, and a no-op when
 * telemetry is disabled. Used by the global crash handlers, which run at the top
 * of the stack and can afford to await before exiting. The synchronous command
 * path cannot await (exitWithError must halt immediately), so handled errors are
 * captured best-effort and may not flush before exit.
 */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  if (state === 'off' || state === 'failed') {
    return;
  }
  try {
    await loading;
    if (sentry) {
      await sentry.flush(timeoutMs);
    }
  } catch {
    // Never let telemetry break the CLI.
  }
}
