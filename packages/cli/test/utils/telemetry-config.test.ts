import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

// os.homedir() honors $HOME (and $USERPROFILE on Windows), and the module under
// test resolves ~/.tigris/telemetry.json once at load. Redirect HOME to a temp
// dir *before* importing it so no test ever touches the real config.
const TEST_HOME = mkdtempSync(join(tmpdir(), 'tigris-telemetry-config-'));
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

const {
  TELEMETRY_STATE_FILE,
  getAnonymousId,
  isTelemetryDisabled,
  markNoticeShown,
  readTelemetryState,
  resetTelemetryStateCache,
  setTelemetryOptOut,
  shouldShowNotice,
  telemetryDisabledReason,
} = await import('../../src/utils/telemetry-config.js');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function clearState(): void {
  rmSync(TELEMETRY_STATE_FILE, { force: true });
  resetTelemetryStateCache();
}

beforeEach(() => {
  // The suite runs with NODE_ENV=test, which disables telemetry outright.
  // 'production' is the only mode where the other switches are observable.
  process.env.NODE_ENV = 'production';
  delete process.env.TIGRIS_NO_TELEMETRY;
  delete process.env.DO_NOT_TRACK;
  delete process.env.TIGRIS_ENV;
  clearState();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

afterAll(() => {
  process.env.HOME = ORIGINAL_HOME;
  process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  rmSync(TEST_HOME, { recursive: true, force: true });
});

describe('telemetry state file location', () => {
  it('lives outside config.json so logout cannot resurrect preferences', () => {
    expect(TELEMETRY_STATE_FILE).toBe(
      join(TEST_HOME, '.tigris', 'telemetry.json')
    );
  });
});

describe('telemetryDisabledReason', () => {
  it('returns null when nothing opts the user out', () => {
    expect(telemetryDisabledReason()).toBeNull();
    expect(isTelemetryDisabled()).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'TRUE', 'on'])(
    'treats TIGRIS_NO_TELEMETRY=%s as opt-out',
    (value) => {
      process.env.TIGRIS_NO_TELEMETRY = value;
      expect(telemetryDisabledReason()).toBe('TIGRIS_NO_TELEMETRY');
    }
  );

  // Regression: the previous `=== '1'` check silently ignored these, so
  // DO_NOT_TRACK=true did nothing at all.
  it.each(['true', 'yes', '2'])(
    'honors the DO_NOT_TRACK convention for value %s',
    (value) => {
      process.env.DO_NOT_TRACK = value;
      expect(telemetryDisabledReason()).toBe('DO_NOT_TRACK');
    }
  );

  it.each(['0', 'false', 'no', '', '   '])(
    'does not opt out for falsy value %s',
    (value) => {
      process.env.TIGRIS_NO_TELEMETRY = value;
      process.env.DO_NOT_TRACK = value;
      expect(telemetryDisabledReason()).toBeNull();
    }
  );

  it('reports the test environment', () => {
    process.env.NODE_ENV = 'test';
    expect(telemetryDisabledReason()).toBe('test');
  });

  it('reports development builds', () => {
    process.env.TIGRIS_ENV = 'development';
    expect(telemetryDisabledReason()).toBe('development');
  });

  it('reports a persisted opt-out', () => {
    setTelemetryOptOut(true);
    expect(telemetryDisabledReason()).toBe('opt-out');
    expect(isTelemetryDisabled()).toBe(true);
  });

  it('reports the env var ahead of a persisted opt-out', () => {
    setTelemetryOptOut(true);
    process.env.DO_NOT_TRACK = '1';
    expect(telemetryDisabledReason()).toBe('DO_NOT_TRACK');
  });
});

describe('setTelemetryOptOut', () => {
  it('reports success when the preference was persisted', () => {
    expect(setTelemetryOptOut(true)).toBe(true);
  });

  // A silent write failure would tell the user telemetry is off and then track
  // them again on the next run, so the caller has to be able to see it.
  it('reports failure when the state file cannot be written', () => {
    // A directory where the state file should be makes writeFileSync fail
    // without needing to manipulate permissions (which root would bypass).
    rmSync(TELEMETRY_STATE_FILE, { force: true });
    mkdirSync(TELEMETRY_STATE_FILE, { recursive: true });
    resetTelemetryStateCache();

    expect(setTelemetryOptOut(true)).toBe(false);

    rmSync(TELEMETRY_STATE_FILE, { recursive: true, force: true });
  });

  it('round-trips through the state file', () => {
    setTelemetryOptOut(true);
    resetTelemetryStateCache();
    expect(readTelemetryState().optOut).toBe(true);

    setTelemetryOptOut(false);
    resetTelemetryStateCache();
    expect(readTelemetryState().optOut).toBe(false);
    expect(isTelemetryDisabled()).toBe(false);
  });

  it('preserves the anonymous id when toggling', () => {
    const id = getAnonymousId();
    setTelemetryOptOut(true);
    resetTelemetryStateCache();
    expect(readTelemetryState().anonymousId).toBe(id);
  });
});

describe('getAnonymousId', () => {
  it('is stable across calls and persists to disk', () => {
    const first = getAnonymousId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(getAnonymousId()).toBe(first);

    resetTelemetryStateCache();
    expect(getAnonymousId()).toBe(first);
  });
});

describe('readTelemetryState', () => {
  it('treats a malformed state file as empty rather than throwing', () => {
    writeFileSync(TELEMETRY_STATE_FILE, 'not json at all', 'utf8');
    resetTelemetryStateCache();
    expect(readTelemetryState()).toEqual({});
    expect(isTelemetryDisabled()).toBe(false);
  });

  it('treats a non-object state file as empty', () => {
    writeFileSync(TELEMETRY_STATE_FILE, '"a string"', 'utf8');
    resetTelemetryStateCache();
    expect(readTelemetryState()).toEqual({});
  });
});

describe('one-time notice', () => {
  it('is owed until marked shown, then never again', () => {
    expect(shouldShowNotice()).toBe(true);
    markNoticeShown();
    expect(shouldShowNotice()).toBe(false);

    resetTelemetryStateCache();
    expect(shouldShowNotice()).toBe(false);
  });
});
