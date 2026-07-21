import * as Sentry from '@sentry/node';
import { version } from '../../package.json';
import { SENTRY_DSN } from '../constants.js';
import type { ErrorCategory } from './errors.js';

/**
 * Error telemetry (Sentry) for the CLI.
 *
 * Reports true crashes plus unexpected ("general") and network failures so we
 * can debug customer issues. Expected, user-facing conditions (auth,
 * permission, not_found, rate_limit) are intentionally not reported — they are
 * noise, not bugs.
 *
 * Telemetry is a strict no-op unless a DSN is configured, and stays disabled in
 * dev/test and whenever the user opts out. It must never change the CLI's
 * behavior or throw into the command path.
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

/**
 * Honor explicit opt-out and the community-standard DO_NOT_TRACK, and stay
 * silent in dev/test so our own runs never pollute production data. (Customer
 * CI is deliberately *not* excluded — that is real usage worth tracking.)
 */
function telemetryDisabled(): boolean {
  return (
    // Product opt-out, matching the repo's TIGRIS_NO_* convention.
    process.env.TIGRIS_NO_TELEMETRY === '1' ||
    // Cross-tool standard
    process.env.DO_NOT_TRACK === '1' ||
    process.env.NODE_ENV === 'test' ||
    process.env.TIGRIS_ENV === 'development'
  );
}

const environment =
  process.env.TIGRIS_ENV === 'development' ? 'development' : 'production';

const SECRET_PATTERNS: RegExp[] = [
  // JWTs / opaque bearer tokens.
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  // AWS-style access key ids.
  /AKIA[0-9A-Z]{16}/g,
  // key=value / key: value where the key names a secret.
  /((?:secret[-_ ]?access[-_ ]?key|secret|password|token|authorization)["']?\s*[:=]\s*["']?)([^\s"',]+)/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    // Patterns with a leading capture group (e.g. `secret=`) preserve it and
    // redact the value; patterns without one redact the whole match. The second
    // replacer arg is the capture only when it's a string — for group-less
    // patterns it's the match offset (a number), which must not be emitted.
    out = out.replace(pattern, (_match, prefix?: string | number) =>
      typeof prefix === 'string' ? `${prefix}[redacted]` : '[redacted]'
    );
  }
  return out;
}

/**
 * Extract only the option/flag NAMES from an argv (e.g. `--format`, `-r`),
 * dropping every value and positional. Positionals and flag values can be user
 * data — bucket names, object keys, file paths, emails — which must never be
 * sent to telemetry; the flag names alone tell us how the CLI was invoked.
 */
export function invocationFlags(argv: string[]): string[] {
  return argv
    .filter((arg) => arg.startsWith('-'))
    .map((arg) => arg.split('=')[0]);
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
 * Final scrub before an event leaves the process: drop the machine hostname and
 * redact secrets that may have reached exception messages or breadcrumbs.
 */
export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  event.server_name = undefined;

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = redactSecrets(exception.value);
    }
  }
  if (event.message) {
    event.message = redactSecrets(event.message);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) {
      crumb.message = redactSecrets(crumb.message);
    }
  }
  return event;
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
  if (!dsn || telemetryDisabled()) {
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
    // Only the flag names — never values or positionals, which can be user data.
    Sentry.setContext('invocation', {
      flags: invocationFlags(process.argv.slice(2)),
    });

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
  opts: { category?: ErrorCategory; command?: string; crash?: boolean } = {}
): void {
  if (!enabled) {
    return;
  }

  const { category, command, crash } = opts;
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
