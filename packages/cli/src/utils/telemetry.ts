import { release } from 'node:os';
import * as Sentry from '@sentry/node';
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

/**
 * The Sentry integrations the CLI uses, listed explicitly rather than filtered
 * from the defaults: building the default list constructs every integration,
 * which cost each command ~10ms even for the ones then dropped. The defaults
 * left out, and why:
 * - OnUncaughtException / OnUnhandledRejection: we own process exit ourselves.
 * - LocalVariables: captures local variable values (e.g. credentials) into
 *   stack frames, which beforeSend does not scrub.
 * - Console / ChildProcess: record breadcrumbs that can carry user data
 *   (printed output, spawned command lines).
 * - ProcessSession: sends a release-health session from a 'beforeExit'
 *   listener, which held every naturally exiting command open for a TLS round
 *   trip (~300ms) and never ran on process.exit() anyway.
 * - Context / ContextLines: gather OS details and source lines asynchronously,
 *   so an error captured right before process.exit() was still being
 *   processed when the process ended. Without them capture is synchronous; the
 *   OS release is set below instead, and source lines of the minified bundle
 *   say little.
 * - RequestData / ConversationId: describe server requests and AI SDK calls,
 *   neither of which a CLI run has.
 */
function cliIntegrations() {
  return [
    Sentry.eventFiltersIntegration(),
    Sentry.functionToStringIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.systemErrorIntegration(),
    Sentry.httpIntegration(),
    Sentry.nativeNodeFetchIntegration(),
    Sentry.modulesIntegration(),
  ];
}

type TransportOptions = Parameters<typeof Sentry.makeNodeTransport>[0];

/**
 * A transport that never touches the network: each envelope is queued for the
 * detached sender (telemetry-sender.ts), which posts it to the DSN's envelope
 * endpoint after the CLI exits. Events reach it already scrubbed by
 * beforeSend.
 */
export function makeQueuedTransport(
  options: TransportOptions
): ReturnType<typeof Sentry.makeNodeTransport> {
  const endpoint = new URL(options.url);
  // The SDK puts auth in the query string; send it as the header instead.
  const key = endpoint.searchParams.get('sentry_key') ?? '';
  endpoint.search = '';
  const headers = {
    'content-type': 'application/x-sentry-envelope',
    'user-agent': `tigris-cli/${version}`,
    'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=tigris-cli/${version}`,
  };
  return Sentry.createTransport(options, (request) => {
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
      // Only integrations that neither fight our exit handling nor capture
      // user data we don't scrub. See cliIntegrations.
      defaultIntegrations: false,
      integrations: cliIntegrations(),
      beforeSend,
      // Delivered by the detached sender; see makeQueuedTransport.
      transport: makeQueuedTransport,
      // Client reports would add an envelope to otherwise clean runs.
      sendClientReports: false,
      // The ESM loader hooks exist for tracing third-party ESM packages, which
      // this CLI does not do; registering them starts a loader thread that
      // cost every command ~17ms.
      registerEsmLoaderHooks: false,
    });

    Sentry.setContext('cli', {
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
 * Wait for captured events to finish processing into the sender queue
 * (bounded; no network I/O happens here). Awaitable, and a no-op when telemetry
 * is disabled. Used by the global crash handlers before they exit. Handled
 * errors on the synchronous exitWithError path do not need it: capture is
 * synchronous, so the envelope is queued before process.exit() runs.
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
