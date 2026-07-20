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
    // Cross-tool standard (https://consoledonottrack.com).
    process.env.DO_NOT_TRACK === '1' ||
    process.env.NODE_ENV === 'test' ||
    process.env.TIGRIS_ENV === 'development'
  );
}

const environment =
  process.env.TIGRIS_ENV === 'development' ? 'development' : 'production';

// Credential-bearing flags whose following value must be redacted from any
// captured argv.
const SECRET_FLAGS: ReadonlySet<string> = new Set([
  '--secret-access-key',
  '--secret-key',
  '--secret',
  '--access-key-id',
  '--access-key',
  '--token',
  '--session-token',
  '--refresh-token',
  '--password',
]);

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
    out = out.replace(pattern, (_match, prefix?: string) =>
      prefix ? `${prefix}[redacted]` : '[redacted]'
    );
  }
  return out;
}

/**
 * Redact secret values from a captured argv: both `--flag value` and
 * `--flag=value` forms, plus any token that itself looks like a secret.
 */
export function scrubArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    if (
      arg.startsWith('--') &&
      eq !== -1 &&
      SECRET_FLAGS.has(arg.slice(0, eq))
    ) {
      out.push(`${arg.slice(0, eq)}=[redacted]`);
      continue;
    }
    out.push(redactSecrets(arg));
    if (SECRET_FLAGS.has(arg) && i + 1 < argv.length) {
      out.push('[redacted]');
      i++;
    }
  }
  return out;
}

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
      // We own process exit via our own handlers; drop Sentry's so it can't
      // race us to process.exit and swallow our classified exit codes.
      integrations: (defaults) =>
        defaults.filter(
          (i) =>
            i.name !== 'OnUncaughtException' &&
            i.name !== 'OnUnhandledRejection'
        ),
      beforeSend,
    });

    Sentry.setContext('cli', {
      version,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    });
    Sentry.setContext('invocation', {
      command: scrubArgv(process.argv.slice(2)).join(' '),
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
