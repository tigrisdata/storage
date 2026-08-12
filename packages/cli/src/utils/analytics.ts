import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { version } from '../../package.json';
import { POSTHOG_HOST, POSTHOG_KEY } from '../constants.js';
import { getInstallMethod, isBinaryBuild } from './install-method.js';
import { scrubArgv } from './redact.js';
import {
  getAnonymousId,
  isTelemetryDisabled,
  markNoticeShown,
  shouldShowNotice,
} from './telemetry-config.js';

/**
 * Usage analytics (PostHog) for the CLI.
 *
 * Scope is deliberately narrow: adoption and usage — which commands run, on
 * what platform, by whom, how often. Failures are *not* tracked here; that is
 * Sentry's job (utils/telemetry.ts), and the split keeps this path from needing
 * to run at process exit (see "Why at command start" below).
 *
 * What is collected: the canonical command path, the scrubbed command arguments
 * (bucket names, object keys, paths, and flag values are kept — they are what
 * make a usage trend actionable), the names of flags used, CLI/runtime/OS
 * versions, install method, auth method, and CI/TTY shape.
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
 * Why at command start: the CLI has no reliable place to flush at exit —
 * `program.parse()` is not awaited and ~370 call sites exit synchronously
 * through `exitWithError`. Firing when the command begins means the request
 * overlaps the command's own work, so it usually costs no wall-clock at all and
 * survives the synchronous exit that ends most commands. The trade is that we
 * record invocations, not outcomes.
 *
 * Known gap: a command that hard-exits *faster* than the request completes
 * (~200ms) still loses its event — `process.exit()` kills an in-flight socket
 * regardless of refs. In practice that means local validation failures (bad
 * arguments, a missing local file) are under-counted, while anything that does
 * real network work reports reliably. Closing this would require funneling
 * every exit through the top level; see the note on outcomes above.
 */

const CAPTURE_PATH = '/i/v0/e/';

/**
 * Upper bound on what analytics can cost a user, and deliberately tight.
 *
 * The socket is left ref'd, so a command that finishes before the request does
 * will wait for it. That is what makes delivery reliable for fast commands, but
 * it also means this timeout is the worst case a user pays when PostHog is
 * *blackholed* — packets dropped with no RST, as on some restrictive corporate
 * networks. Measured round-trip to the ingest host is ~200ms, so 1s leaves ~5x
 * headroom for a slow connection while capping the pathological case at
 * something a person barely notices. Ordinary offline failures (DNS failure,
 * connection refused) error out immediately and never reach the timeout.
 *
 * `socket.unref()` is not used to shorten this: for a socket that is still
 * connecting, unref does not release the event loop, so it would cap nothing.
 */
const REQUEST_TIMEOUT_MS = 1000;

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
  authMethod: 'oauth' | 'credentials' | 'none';
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

/**
 * POST a single event. Never rejects and never throws — every outcome
 * (success, network error, timeout, malformed host) resolves quietly.
 */
function post(body: unknown): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    try {
      const url = new URL(CAPTURE_PATH, resolveHost());
      const payload = JSON.stringify(body);
      // http support exists only so a local PostHog can be pointed at via
      // TIGRIS_POSTHOG_HOST; the shipped default is always https.
      const request = url.protocol === 'http:' ? httpRequest : httpsRequest;

      const req = request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: url.pathname,
          method: 'POST',
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
            'user-agent': `tigris-cli/${version}`,
          },
        },
        (res) => {
          // Drain so the socket can close, then settle regardless of status —
          // there is nothing useful to do about a rejected event.
          res.resume();
          res.on('end', done);
          res.on('error', done);
        }
      );

      req.on('error', done);
      req.on('timeout', () => {
        req.destroy();
        done();
      });
      req.end(payload);
    } catch {
      done();
    }
  });
}

const NOTICE = `
Tigris CLI collects usage analytics (which commands you run and their
arguments, CLI version, OS) and error reports, to help us decide what to
improve. Credentials — access keys, secrets, tokens — are never collected.

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

/**
 * Record a command invocation. Fire-and-forget: callers should `void` this
 * rather than await it, so the request overlaps the command's own work.
 */
export async function captureCommand(commandPath: string[]): Promise<void> {
  try {
    const apiKey = resolveKey();
    if (!apiKey || isTelemetryDisabled()) {
      return;
    }

    const identity = await resolveIdentity();
    const argv = process.argv.slice(2);

    await post({
      api_key: apiKey,
      event: 'cli_command',
      distinct_id: identity.distinctId,
      properties: {
        ...baseProperties(),
        // The canonical path from the command registry, never raw user input.
        command: commandPath.join(' '),
        command_root: commandPath[0],
        // Full arguments with credentials and third-party PII stripped by the
        // shared scrubber. High cardinality by nature — use `command` and
        // `flags` for aggregation and this for looking at real invocations.
        command_args: scrubArgv(argv).join(' '),
        flags: usedFlags(argv),
        auth_method: identity.authMethod,
        json_mode: globalThis.__TIGRIS_JSON_MODE === true,
        // Namespaced so CLI events never clobber console-owned person
        // properties such as `email` and `name`.
        $set: {
          cli_version: version,
          cli_install_method: getInstallMethod(),
          cli_last_os: process.platform,
        },
        ...(identity.organizationId
          ? { $groups: { company: identity.organizationId } }
          : {}),
      },
    });
  } catch {
    // Analytics must never affect the CLI.
  }
}

/**
 * Single entry point for the command dispatcher: show the disclosure notice if
 * it is owed, then record the invocation without waiting for it.
 */
export function trackCommand(commandPath: string[]): void {
  if (UNTRACKED_COMMANDS.has(commandPath[0])) {
    return;
  }
  printTelemetryNoticeOnce();
  void captureCommand(commandPath);
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

    await post({
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
        ...(identity.organizationId
          ? { $groups: { company: identity.organizationId } }
          : {}),
      },
    });
  } catch {
    // Analytics must never affect the CLI.
  }
}
