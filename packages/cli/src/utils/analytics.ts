import { version } from '../../package.json';
import { POSTHOG_HOST, POSTHOG_KEY } from '../constants.js';
import { classifyError, type ErrorCategory, ExitCode } from './errors.js';
import { getInstallMethod, isBinaryBuild } from './install-method.js';
import { scrubArgv } from './redact.js';
import {
  getAnonymousId,
  isTelemetryDisabled,
  markNoticeShown,
  shouldShowNotice,
} from './telemetry-config.js';
import {
  queueTelemetry,
  resetTelemetryQueueForTesting,
  sendQueuedTelemetry,
} from './telemetry-sender.js';

/**
 * Usage analytics (PostHog) for the CLI.
 *
 * Scope is deliberately narrow: adoption, usage and outcomes — which commands
 * run, on what platform, by whom, how often, and whether they succeeded.
 * Failure *details* (messages, stacks) are Sentry's job (utils/telemetry.ts);
 * this side records only a coarse `error_category` and, when the error carries
 * one, a short machine `error_code` (an S3 error name, a Node errno, a
 * commander usage code) — never the message.
 *
 * What is collected: the canonical command path, the scrubbed command arguments
 * (bucket names, object keys, paths, and flag values are kept — they are what
 * make a usage trend actionable), the names of flags used, the outcome (success,
 * exit code, duration), CLI/runtime/OS versions, install method, auth method,
 * and CI/TTY shape.
 *
 * What is never collected: credentials of any kind — access keys, secrets,
 * tokens, passwords — nor the machine hostname or working directory. Arguments
 * pass through the shared scrubber in redact.ts, the same one that guards error
 * reports, so a redaction fix protects both surfaces at once. Third-party email
 * addresses are redacted too; the one personal value deliberately sent is the
 * signed-in user's own email as the PostHog `distinct_id`, so CLI activity joins
 * the same person record the console creates.
 *
 * Analytics is a strict no-op without a project key, stays disabled in
 * dev/test, and honors the shared opt-out. It must never change the CLI's
 * behavior, add a failure mode, or throw into the command path.
 *
 * When the event is sent: once per invocation, when the command *ends*, so it
 * can say how it ended. A command ends in one of three ways, and each is hooked:
 *
 *   1. It returns — the dispatcher calls finishCommand() (cli-core.ts).
 *   2. Anything calls process.exit() — the ~370 exitWithError() sites, the
 *      dispatcher's own local-validation exits, commander usage errors, and
 *      commands that exit 0 on success. process.exit is wrapped while a command
 *      is being tracked, so no call site needs to know about analytics.
 *   3. Ctrl-C — a SIGINT listener records `exit_code: 130` and re-raises.
 *
 * Most exits are synchronous `never` calls, and a request in flight dies with
 * process.exit(), so the event is not sent from this process: it is handed to
 * a detached sender child (telemetry-sender.ts) that posts it after the CLI
 * has exited. The command pays for writing a temp file and a spawn, not for a
 * round trip.
 *
 * Known gaps, all of which simply lose the one event:
 * - SIGKILL, a native crash, or a second Ctrl-C before the first is handled.
 * - A restricted environment where the sender child cannot start: the event is
 *   posted in-process instead, which survives a natural exit but not a hard
 *   process.exit().
 * - Exits in the same tick the command starts (local validation) are sent
 *   before the stored login has been read, so they carry the machine's
 *   anonymous id and `auth_method: 'unknown'`. PostHog still attributes them to
 *   the signed-in person once `$identify` has linked that anonymous id.
 */

const CAPTURE_PATH = '/i/v0/e/';

/** Exit code for a run ended by Ctrl-C, matching the shell convention. */
const SIGINT_EXIT_CODE = 130;

/**
 * The Sentry categories from errors.ts, plus two that only make sense for
 * outcomes: `usage` (rejected by local validation before any work — unknown
 * command or flag, missing argument) and `interrupted` (Ctrl-C).
 */
export type AnalyticsErrorCategory = ErrorCategory | 'usage' | 'interrupted';

/** Project key and host. Env overrides exist for staging and local PostHog. */
function resolveKey(): string {
  return process.env.TIGRIS_POSTHOG_KEY?.trim() || POSTHOG_KEY;
}

function resolveHost(): string {
  return process.env.TIGRIS_POSTHOG_HOST?.trim() || POSTHOG_HOST;
}

const CI_ENV_VARS = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'BUILD_NUMBER',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'JENKINS_URL',
  'BUILDKITE',
  'TEAMCITY_VERSION',
  'TF_BUILD',
];

export function isCI(): boolean {
  return CI_ENV_VARS.some((name) => {
    const value = process.env[name];
    return (
      value !== undefined &&
      value !== '' &&
      value !== '0' &&
      value.toLowerCase() !== 'false'
    );
  });
}

// A flag name is a fixed CLI keyword. Anything not matching this shape is
// dropped, keeping this a clean low-cardinality dimension for aggregation
// ("what share of runs pass --json") rather than a second copy of the args.
const FLAG_NAME_RE = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * The names of flags the user typed, with values dropped — the full arguments
 * are reported separately by `scrubArgv`. Read from raw argv rather than the
 * parsed options object on purpose: parsed options are populated with spec
 * defaults, which would report flags nobody passed.
 */
export function usedFlags(argv: string[]): string[] {
  const names = new Set<string>();
  for (const arg of argv) {
    // Stop at the end-of-options separator: everything after it is positional,
    // and a positional may legitimately begin with a dash (object keys can).
    // Scanning past `--` would file those values under the flags dimension.
    if (arg === '--') {
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      continue;
    }
    const name = arg.split('=')[0].replace(/^--?/, '');
    if (FLAG_NAME_RE.test(name)) {
      names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * Read the `email` claim out of a stored ID token.
 *
 * Deliberately does not verify the signature: this only labels our own
 * analytics, so it is not a security decision, and verification would cost a
 * JWKS network round trip on every command. A user who forges this is
 * mislabeling their own usage data.
 */
export function decodeTokenEmail(idToken: string): string | undefined {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) {
      return undefined;
    }
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );
    const email = (claims as { email?: unknown } | null)?.email;
    return typeof email === 'string' && email.length > 0 ? email : undefined;
  } catch {
    return undefined;
  }
}

interface Identity {
  /** Email when signed in, otherwise the machine's anonymous id. */
  distinctId: string;
  anonymousId: string;
  isIdentified: boolean;
  /** `unknown` when the command ended before the login could be read. */
  authMethod: 'oauth' | 'credentials' | 'none' | 'unknown';
  organizationId?: string;
}

/**
 * Resolve who this invocation belongs to.
 *
 * `@auth/storage.js` is imported dynamically to keep it (and its transitive
 * deps) off the startup path of every command — this module is reachable from
 * cli-core, which loads before anything is dispatched.
 */
async function resolveIdentity(): Promise<Identity> {
  const anonymousId = getAnonymousId();
  const fallback: Identity = {
    distinctId: anonymousId,
    anonymousId,
    isIdentified: false,
    authMethod: 'none',
  };

  try {
    const storage = await import('@auth/storage.js');
    const tokens = await storage.getTokens();
    const email = tokens?.idToken
      ? decodeTokenEmail(tokens.idToken)
      : undefined;

    return {
      distinctId: email ?? anonymousId,
      anonymousId,
      isIdentified: email !== undefined,
      authMethod: storage.getLoginMethod() ?? 'none',
      organizationId: storage.getSelectedOrganization() ?? undefined,
    };
  } catch {
    return fallback;
  }
}

/** Identity for a command that ended before resolveIdentity() settled. */
function anonymousIdentity(): Identity {
  const anonymousId = getAnonymousId();
  return {
    distinctId: anonymousId,
    anonymousId,
    isIdentified: false,
    authMethod: 'unknown',
  };
}

/**
 * Properties describing the CLI itself. `$lib`/`$lib_version` follow PostHog
 * convention so CLI events are filterable alongside the console's web events
 * in the same project.
 */
function baseProperties(): Record<string, unknown> {
  return {
    $lib: 'tigris-cli',
    $lib_version: version,
    interface: 'cli',
    cli_version: version,
    runtime: isBinaryBuild() ? 'binary' : 'node',
    install_method: getInstallMethod(),
    node_version: process.version,
    os: process.platform,
    arch: process.arch,
    is_ci: isCI(),
    is_tty: process.stdout.isTTY === true,
  };
}

/** Queue one PostHog event for the detached sender. */
function queueEvent(event: Record<string, unknown>): void {
  queueTelemetry({
    url: new URL(CAPTURE_PATH, resolveHost()).href,
    headers: {
      'content-type': 'application/json',
      'user-agent': `tigris-cli/${version}`,
    },
    body: JSON.stringify(event),
  });
}

const NOTICE = `
Tigris CLI collects usage analytics (which commands you run, their arguments
and whether they succeed, CLI version, OS) and error reports, to help us
decide what to improve. Credentials — access keys, secrets, tokens — are
never collected.

Opt out any time:  tigris telemetry disable   (or set TIGRIS_NO_TELEMETRY=1)
`;

/**
 * Commands excluded from analytics. Managing your telemetry preference is not
 * product usage, and capturing it would mean sending one last event for the
 * very command someone runs to opt out.
 */
const UNTRACKED_COMMANDS: ReadonlySet<string> = new Set(['telemetry']);

/**
 * Print the one-time disclosure notice, at most once per machine.
 *
 * Written to stderr so it can never corrupt piped stdout, and only in an
 * interactive terminal — the notice is only marked shown when it was actually
 * displayed, so a CI run doesn't consume the one chance a human has to read it.
 */
function printTelemetryNoticeOnce(): void {
  if (isTelemetryDisabled()) {
    return;
  }
  if (process.stderr.isTTY !== true || globalThis.__TIGRIS_JSON_MODE === true) {
    return;
  }
  if (!shouldShowNotice()) {
    return;
  }
  console.error(NOTICE);
  markNoticeShown();
}

interface TrackedCommand {
  path: string[];
  startedAt: number;
  /** Filled in asynchronously; absent if the command ends first. */
  identity?: Identity;
  error?: unknown;
  errorCode?: string;
  errorCategory?: AnalyticsErrorCategory;
}

let tracked: TrackedCommand | null = null;
let ended = false;
let originalExit: typeof process.exit | null = null;
let sigintListener: (() => void) | null = null;

/** process.exit() accepts strings and undefined; PostHog wants an integer. */
function normalizeExitCode(code: number | string | null | undefined): number {
  const value = Number(code ?? 0);
  return Number.isInteger(value) ? value : 1;
}

const CATEGORY_BY_EXIT_CODE: Record<number, ErrorCategory> = {
  [ExitCode.GeneralError]: 'general',
  [ExitCode.AuthFailure]: 'auth',
  [ExitCode.NotFound]: 'not_found',
  [ExitCode.RateLimit]: 'rate_limit',
  [ExitCode.NetworkError]: 'network',
};

// Shaped like a code, not a sentence: no spaces, bounded length. Generic
// constructor names say nothing, so they are not reported as codes.
const ERROR_CODE_RE = /^[A-Za-z][A-Za-z0-9_.-]{1,63}$/;
const GENERIC_ERROR_NAMES: ReadonlySet<string> = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'AggregateError',
  'CommanderError',
]);

/**
 * A short machine code carried by the error itself: the S3 error name (`Code`
 * or `name` on AWS SDK errors), a Node errno (`ENOTFOUND`), or a commander
 * usage code. Never derived from the message.
 */
export function errorCodeOf(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }
  const { Code, code, name } = error as Record<string, unknown>;
  for (const candidate of [Code, code, name]) {
    if (
      typeof candidate === 'string' &&
      ERROR_CODE_RE.test(candidate) &&
      !GENERIC_ERROR_NAMES.has(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

function failureProperties(
  state: TrackedCommand,
  exitCode: number
): Record<string, unknown> {
  let category: AnalyticsErrorCategory;
  if (state.errorCategory) {
    category = state.errorCategory;
  } else if (exitCode === SIGINT_EXIT_CODE) {
    category = 'interrupted';
  } else if (state.error !== undefined) {
    category = classifyError(state.error).category;
  } else {
    category = CATEGORY_BY_EXIT_CODE[exitCode] ?? 'general';
  }
  const code = state.errorCode ?? errorCodeOf(state.error);
  return { error_category: category, ...(code ? { error_code: code } : {}) };
}

/**
 * Person properties set once, on the first event that carries them, so the
 * person record keeps the surface they first arrived through.
 */
function firstTouchProperties(): Record<string, unknown> {
  return {
    first_interface: 'cli',
    first_cli_install_method: getInstallMethod(),
    first_cli_version: version,
  };
}

function buildCommandEvent(
  state: TrackedCommand,
  exitCode: number
): Record<string, unknown> {
  const identity = state.identity ?? anonymousIdentity();
  const argv = process.argv.slice(2);
  const success = exitCode === 0;

  return {
    api_key: resolveKey(),
    event: 'cli_command',
    distinct_id: identity.distinctId,
    properties: {
      ...baseProperties(),
      // The canonical path from the command registry, never raw user input.
      command: state.path.join(' '),
      command_root: state.path[0],
      // Full arguments with credentials and third-party PII stripped by the
      // shared scrubber. High cardinality by nature — use `command` and
      // `flags` for aggregation and this for looking at real invocations.
      command_args: scrubArgv(argv).join(' '),
      flags: usedFlags(argv),
      auth_method: identity.authMethod,
      json_mode: globalThis.__TIGRIS_JSON_MODE === true,
      success,
      exit_code: exitCode,
      // From dispatch to exit, so it excludes CLI startup.
      duration_ms: Math.round(performance.now() - state.startedAt),
      ...(success ? {} : failureProperties(state, exitCode)),
      // Namespaced so CLI events never clobber console-owned person
      // properties such as `email` and `name`.
      $set: {
        cli_version: version,
        cli_install_method: getInstallMethod(),
        cli_last_os: process.platform,
      },
      $set_once: firstTouchProperties(),
      ...(identity.organizationId
        ? { $groups: { company: identity.organizationId } }
        : {}),
    },
  };
}

/**
 * Wrap process.exit and listen for Ctrl-C for the rest of this run. Installed
 * only once a command is actually being tracked, so with telemetry off the
 * process is untouched.
 */
function installExitHooks(): void {
  if (originalExit) {
    return;
  }
  const exit = process.exit;
  originalExit = exit;
  process.exit = ((code?: number | string | null) => {
    finishCommand(code ?? process.exitCode);
    return exit.call(process, code);
  }) as typeof process.exit;

  const onSigint = () => {
    // A command with its own Ctrl-C handling (`buckets migrate` stops
    // gracefully on the first one) owns the outcome; when it exits, the
    // process.exit hook above records it.
    if (process.listenerCount('SIGINT') > 1) {
      return;
    }
    finishCommand(SIGINT_EXIT_CODE);
    // finishCommand removed this listener, so re-raising takes the default
    // action: the shell sees a death by SIGINT, exactly as without analytics.
    try {
      process.kill(process.pid, 'SIGINT');
    } catch {
      exit.call(process, SIGINT_EXIT_CODE);
    }
  };
  sigintListener = onSigint;
  process.on('SIGINT', onSigint);
}

/**
 * Start tracking a command run: show the disclosure notice if it is owed, and
 * hook the ways the run can end. Called by
 * the dispatcher as soon as it knows which command is running — before local
 * validation, so a rejected invocation is recorded too. The first call wins;
 * later calls for the same run are ignored.
 */
export function trackCommand(commandPath: string[]): void {
  if (tracked || ended || UNTRACKED_COMMANDS.has(commandPath[0])) {
    return;
  }
  try {
    printTelemetryNoticeOnce();
    if (!resolveKey() || isTelemetryDisabled()) {
      return;
    }
    const state: TrackedCommand = {
      path: [...commandPath],
      startedAt: performance.now(),
    };
    tracked = state;
    void resolveIdentity().then((identity) => {
      state.identity = identity;
    });
    installExitHooks();
  } catch {
    // Analytics must never affect the CLI.
  }
}

/**
 * Attach the error a tracked command is failing with, so its event can carry
 * `error_category` / `error_code`. `detail` overrides what would be derived
 * from the error, for failures the CLI itself raises (an unknown command has
 * no error object). The first error recorded wins.
 */
export function recordCommandError(
  error: unknown,
  detail: { code?: string; category?: AnalyticsErrorCategory } = {}
): void {
  if (!tracked || tracked.error !== undefined || tracked.errorCode) {
    return;
  }
  tracked.error = error ?? null;
  tracked.errorCode = detail.code;
  tracked.errorCategory = detail.category;
}

/**
 * Hand the tracked command's `cli_command` event, with its outcome, to the
 * detached sender, along with anything else queued (a `$identify`, Sentry
 * envelopes). Returns without waiting on the network. Idempotent: only the
 * first call in a run sends. Called by the dispatcher when a command returns,
 * and by the process.exit and SIGINT hooks.
 */
export function finishCommand(code?: number | string | null): void {
  const state = tracked;
  if (!state || ended) {
    return;
  }
  ended = true;
  tracked = null;
  if (sigintListener) {
    process.removeListener('SIGINT', sigintListener);
    sigintListener = null;
  }
  try {
    queueEvent(buildCommandEvent(state, normalizeExitCode(code)));
    sendQueuedTelemetry();
  } catch {
    // Analytics must never affect the CLI.
  }
}

/** Test seam: undo the hooks and forget the current run. */
export function resetCommandTrackingForTesting(): void {
  if (originalExit) {
    process.exit = originalExit;
    originalExit = null;
  }
  if (sigintListener) {
    process.removeListener('SIGINT', sigintListener);
    sigintListener = null;
  }
  tracked = null;
  ended = false;
  resetTelemetryQueueForTesting();
}

/**
 * Attach this machine's pre-login activity to the user who just signed in.
 *
 * `$anon_distinct_id` is what makes the install → first command → logged in
 * funnel work: PostHog merges the anonymous person into the identified one.
 * The identified id is the email, which is also what the console aliases to,
 * so CLI and web activity land on a single person.
 */
export async function identifyOnLogin(): Promise<void> {
  try {
    const apiKey = resolveKey();
    if (!apiKey || isTelemetryDisabled()) {
      return;
    }

    const identity = await resolveIdentity();
    if (!identity.isIdentified) {
      return;
    }

    // Queued, not sent: it goes out with the login command's own event.
    queueEvent({
      api_key: apiKey,
      event: '$identify',
      distinct_id: identity.distinctId,
      properties: {
        ...baseProperties(),
        $anon_distinct_id: identity.anonymousId,
        $set: {
          email: identity.distinctId,
          cli_version: version,
          cli_install_method: getInstallMethod(),
        },
        // Only takes effect if the person has no first touch yet, e.g. one
        // recorded by the console.
        $set_once: firstTouchProperties(),
        ...(identity.organizationId
          ? { $groups: { company: identity.organizationId } }
          : {}),
      },
    });
  } catch {
    // Analytics must never affect the CLI.
  }
}
