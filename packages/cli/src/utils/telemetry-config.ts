import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Shared opt-out gate and persisted state for both CLI telemetry surfaces:
 * error reports (Sentry — utils/telemetry.ts) and usage analytics (PostHog —
 * utils/analytics.ts). Both read the gate here so there is exactly one opt-out
 * for users to find, and turning it off turns off everything.
 *
 * State lives in ~/.tigris/telemetry.json rather than config.json on purpose:
 * `logout` clears config.json wholesale, and neither the opt-out nor the
 * anonymous id should come back to life because someone logged out.
 */

const STATE_DIR = join(homedir(), '.tigris');
const STATE_FILE = join(STATE_DIR, 'telemetry.json');

// Exported for tests and for `tigris telemetry status` to show the user.
export { STATE_FILE as TELEMETRY_STATE_FILE };

export interface TelemetryState {
  /** Stable per-machine id used when no authenticated user is known. */
  anonymousId?: string;
  /** Persisted opt-out, set by `tigris telemetry disable`. */
  optOut?: boolean;
  /** When the one-time disclosure notice was printed (epoch ms). */
  noticeShownAt?: number;
}

let cached: TelemetryState | null = null;

/**
 * Read persisted state, memoized for the life of the process. A missing,
 * unreadable, or malformed file is treated as empty state — telemetry
 * preferences must never be a reason the CLI fails to start.
 */
export function readTelemetryState(): TelemetryState {
  if (cached) {
    return cached;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    cached =
      parsed !== null && typeof parsed === 'object'
        ? (parsed as TelemetryState)
        : {};
  } catch {
    cached = {};
  }
  return cached;
}

/**
 * Persist state. Returns false when it could not be written (read-only home,
 * full disk). Callers recording a *user's explicit preference* must surface
 * that; callers doing best-effort bookkeeping may ignore it.
 */
function writeTelemetryState(next: TelemetryState): boolean {
  // Cache first: even when the write below fails, the in-memory value keeps
  // this process internally consistent.
  cached = next;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Test seam: drop the memoized state so a fresh read hits the filesystem. */
export function resetTelemetryStateCache(): void {
  cached = null;
}

/**
 * Truthiness for the opt-out env vars. `DO_NOT_TRACK`'s convention is that any
 * value other than `0`/empty means opt out, so this deliberately accepts more
 * than the literal `'1'` the CLI used to require — `DO_NOT_TRACK=true`
 * previously did nothing at all. Broadening can only ever add opt-outs.
 */
function isEnvTruthy(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }
  const value = raw.trim().toLowerCase();
  return value !== '' && value !== '0' && value !== 'false' && value !== 'no';
}

export type TelemetryDisabledReason =
  | 'TIGRIS_NO_TELEMETRY'
  | 'DO_NOT_TRACK'
  | 'opt-out'
  | 'development'
  | 'test';

/**
 * Why telemetry is off, or null when it is on. Surfaced by
 * `tigris telemetry status` so users can see *which* switch is in effect —
 * an env var set by their CI image explains a lot more than "disabled".
 */
export function telemetryDisabledReason(): TelemetryDisabledReason | null {
  if (isEnvTruthy(process.env.TIGRIS_NO_TELEMETRY)) {
    return 'TIGRIS_NO_TELEMETRY';
  }
  if (isEnvTruthy(process.env.DO_NOT_TRACK)) {
    return 'DO_NOT_TRACK';
  }
  // Our own runs must never pollute production data. Customer CI is
  // deliberately *not* excluded — that is real usage worth measuring.
  if (process.env.NODE_ENV === 'test') {
    return 'test';
  }
  if (process.env.TIGRIS_ENV === 'development') {
    return 'development';
  }
  if (readTelemetryState().optOut === true) {
    return 'opt-out';
  }
  return null;
}

export function isTelemetryDisabled(): boolean {
  return telemetryDisabledReason() !== null;
}

/**
 * Stable anonymous id for this machine, created on first use.
 *
 * If the state file cannot be written (read-only home), each run gets a fresh
 * id and person counts inflate. That degrades gracefully rather than failing,
 * and such runs are almost always CI, which the `is_ci` property lets us
 * filter out downstream.
 */
export function getAnonymousId(): string {
  const state = readTelemetryState();
  if (state.anonymousId) {
    return state.anonymousId;
  }
  const anonymousId = randomUUID();
  writeTelemetryState({ ...state, anonymousId });
  return anonymousId;
}

/**
 * Record the user's telemetry preference.
 *
 * Returns false when the preference could not be persisted, which callers MUST
 * surface rather than swallow: telling someone telemetry is off and then
 * tracking them again on the next run — because the write silently failed — is
 * exactly the outcome the opt-out exists to prevent.
 */
export function setTelemetryOptOut(optOut: boolean): boolean {
  return writeTelemetryState({ ...readTelemetryState(), optOut });
}

/** True until the one-time disclosure notice has been recorded as shown. */
export function shouldShowNotice(): boolean {
  return readTelemetryState().noticeShownAt === undefined;
}

export function markNoticeShown(): void {
  writeTelemetryState({ ...readTelemetryState(), noticeShownAt: Date.now() });
}
