import * as Sentry from '@sentry/node';
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
 */

// Categories worth reporting for a handled (failWithError) exit. Crashes are
// always reported regardless of category.
const REPORTABLE_CATEGORIES: ReadonlySet<ErrorCategory> =
  new Set<ErrorCategory>(['general', 'network']);

let initialized = false;
let enabled = false;

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
const DISABLED_INTEGRATIONS: ReadonlySet<string> = new Set([
  'OnUncaughtException',
  'OnUnhandledRejection',
  'LocalVariables',
  'LocalVariablesAsync',
  'Console',
  'ChildProcess',
]);

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
export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  event.server_name = undefined;
  return deepRedact(event) as Sentry.ErrorEvent;
}

/**
 * Initialize telemetry. Idempotent, and a no-op when disabled or unconfigured.
 * Called once from setupErrorHandlers() before the program runs.
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

  try {
    Sentry.init({
      dsn,
      release: `@tigrisdata/cli@${version}`,
      environment,
      // Error reporting only — no performance tracing.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // Drop integrations that either fight our exit handling or capture user
      // data we don't scrub (local variables, console/child-process
      // breadcrumbs). See DISABLED_INTEGRATIONS.
      integrations: (defaults) =>
        defaults.filter((i) => !DISABLED_INTEGRATIONS.has(i.name)),
      beforeSend,
    });

    Sentry.setContext('cli', {
      version,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    });
    // The full command with credentials and PII (access keys, tokens, emails,
    // names) redacted. Kept for debugging; identifies the command on the crash
    // path too, where there is no MessageContext.
    const argv = process.argv.slice(2);
    Sentry.setContext('invocation', {
      command: scrubArgv(argv).join(' '),
    });
    // Searchable tag for the top-level command (a fixed CLI keyword, not data).
    const command = invocationCommand(argv);
    if (command) {
      Sentry.setTag('command', command);
    }

    enabled = true;
  } catch {
    // Never let telemetry setup break the CLI.
    enabled = false;
  }
}

/**
 * Report an error. Crashes are always reported; handled exits are reported only
 * for the categories we care about. No-op when telemetry is disabled.
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
  if (!enabled) {
    return;
  }

  const { category, command, crash, exitCode } = opts;
  if (!crash && category && !REPORTABLE_CATEGORIES.has(category)) {
    return;
  }

  try {
    Sentry.captureException(error, (scope) => {
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
}

/**
 * Flush any queued events (best effort, bounded). Awaitable, and a no-op when
 * telemetry is disabled. Used by the global crash handlers, which run at the top
 * of the stack and can afford to await before exiting. The synchronous command
 * path cannot await (exitWithError must halt immediately), so handled errors are
 * captured best-effort and may not flush before exit.
 */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  if (!enabled) {
    return;
  }
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Never let telemetry break the CLI.
  }
}
