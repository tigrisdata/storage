import { mkdtempSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Redirect HOME before importing anything that resolves ~/.tigris, so the
// anonymous id is written to a temp dir instead of the developer's real config.
const TEST_HOME = mkdtempSync(join(tmpdir(), 'tigris-analytics-'));
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

// Identity comes from the auth config on disk; mock it so these tests do not
// depend on whether the developer running them happens to be logged in.
const { identity } = vi.hoisted(() => ({
  identity: {
    idToken: undefined as string | undefined,
    loginMethod: null as 'oauth' | 'credentials' | null,
    organizationId: null as string | null,
  },
}));

vi.mock('../../src/auth/storage.js', () => ({
  getTokens: async () =>
    identity.idToken ? { accessToken: 'a', idToken: identity.idToken } : null,
  getLoginMethod: () => identity.loginMethod,
  getSelectedOrganization: () => identity.organizationId,
}));

// Capture what would go over the wire instead of sending it.
const { sentBodies, requestMock } = vi.hoisted(() => {
  const sentBodies: string[] = [];
  const requestMock = (
    _options: unknown,
    callback?: (res: unknown) => void
  ) => {
    const res = {
      resume: () => {},
      on: (event: string, handler: () => void) => {
        if (event === 'end') {
          setImmediate(handler);
        }
      },
    };
    if (callback) {
      setImmediate(() => callback(res));
    }
    return {
      on: () => {},
      end: (payload: string) => {
        sentBodies.push(payload);
      },
      destroy: () => {},
    };
  };
  return { sentBodies, requestMock };
});

vi.mock('node:https', () => ({ request: requestMock }));
vi.mock('node:http', () => ({ request: requestMock }));

const {
  captureCommand,
  decodeTokenEmail,
  identifyOnLogin,
  isCI,
  trackCommand,
  usedFlags,
} = await import('../../src/utils/analytics.js');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ARGV = process.argv;

const CI_VARS = [
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

/** Let the mocked request's setImmediate callbacks settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  sentBodies.length = 0;
  // The suite runs with NODE_ENV=test, which disables telemetry outright.
  process.env.NODE_ENV = 'production';
  process.env.TIGRIS_POSTHOG_KEY = 'phc_test_key';
  delete process.env.TIGRIS_NO_TELEMETRY;
  delete process.env.DO_NOT_TRACK;
  delete process.env.TIGRIS_ENV;
  for (const name of CI_VARS) {
    delete process.env[name];
  }
  identity.idToken = undefined;
  identity.loginMethod = null;
  identity.organizationId = null;
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete process.env.TIGRIS_POSTHOG_KEY;
  process.argv = ORIGINAL_ARGV;
});

afterAll(() => {
  process.env.HOME = ORIGINAL_HOME;
  process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  rmSync(TEST_HOME, { recursive: true, force: true });
});

describe('usedFlags', () => {
  it('keeps flag names and drops their values', () => {
    expect(
      usedFlags(['cp', './local.txt', 't3://bucket/key', '--json', '-y'])
    ).toEqual(['json', 'y']);
  });

  it('drops the value from --flag=value form', () => {
    expect(usedFlags(['--region=iad', '--format=json'])).toEqual([
      'format',
      'region',
    ]);
  });

  it('deduplicates and sorts for stable grouping in PostHog', () => {
    expect(usedFlags(['--json', '--region', 'iad', '--json'])).toEqual([
      'json',
      'region',
    ]);
  });

  it('ignores bare separators', () => {
    expect(usedFlags(['-', '--', 'bucket'])).toEqual([]);
  });

  // Object keys may legitimately begin with a dash, and `--` is how they get
  // past the parser. Scanning further would report the key itself as a flag.
  it('stops at the end-of-options separator so positionals cannot leak', () => {
    expect(usedFlags(['rm', '--json', '--', '-my-secret-object'])).toEqual([
      'json',
    ]);
    expect(usedFlags(['rm', '--', '-a', '--bucket-name'])).toEqual([]);
  });

  it('drops anything that is not a plain flag name', () => {
    // A value that happens to start with a dash must not be reported as a flag.
    expect(usedFlags(['--key', '-----', '--a b', '--x/y'])).toEqual(['key']);
  });
});

describe('decodeTokenEmail', () => {
  const encode = (claims: unknown) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

  it('reads the email claim', () => {
    expect(decodeTokenEmail(encode({ email: 'alice@example.com' }))).toBe(
      'alice@example.com'
    );
  });

  it('returns undefined when there is no email claim', () => {
    expect(decodeTokenEmail(encode({ sub: 'user_123' }))).toBeUndefined();
  });

  it('returns undefined for an empty email claim', () => {
    expect(decodeTokenEmail(encode({ email: '' }))).toBeUndefined();
  });

  it('returns undefined rather than throwing on malformed input', () => {
    expect(decodeTokenEmail('not-a-jwt')).toBeUndefined();
    expect(decodeTokenEmail('')).toBeUndefined();
    expect(decodeTokenEmail('header..sig')).toBeUndefined();
    expect(decodeTokenEmail('header.@@@not-base64@@@.sig')).toBeUndefined();
  });
});

describe('isCI', () => {
  it('is false with no CI variables set', () => {
    expect(isCI()).toBe(false);
  });

  it.each(['CI', 'GITHUB_ACTIONS', 'BUILDKITE'])('detects %s', (name) => {
    process.env[name] = 'true';
    expect(isCI()).toBe(true);
  });

  it.each(['false', '0', ''])('ignores CI=%s', (value) => {
    process.env.CI = value;
    expect(isCI()).toBe(false);
  });
});

describe('captureCommand', () => {
  it('sends a cli_command event with the canonical command path', async () => {
    process.argv = ['node', 'tigris', 'buckets', 'create', 'x', '--json'];
    await captureCommand(['buckets', 'create']);

    expect(sentBodies).toHaveLength(1);
    const body = JSON.parse(sentBodies[0]);
    expect(body.event).toBe('cli_command');
    expect(body.api_key).toBe('phc_test_key');
    expect(body.properties.command).toBe('buckets create');
    expect(body.properties.command_root).toBe('buckets');
    expect(body.properties.flags).toEqual(['json']);
    expect(body.properties.$lib).toBe('tigris-cli');
    expect(body.properties.auth_method).toBe('none');
    expect(typeof body.distinct_id).toBe('string');
    expect(body.distinct_id.length).toBeGreaterThan(0);
  });

  // Bucket names, object keys, paths and flag values are intentionally kept —
  // they are what make a usage trend actionable.
  it('sends command arguments, including bucket names, keys, and paths', async () => {
    process.argv = [
      'node',
      'tigris',
      'cp',
      './invoices/q3.pdf',
      't3://acme-bucket/reports/q3.pdf',
      '--region=iad',
    ];
    await captureCommand(['cp']);

    const props = JSON.parse(sentBodies[0]).properties;
    expect(props.command_args).toBe(
      'cp ./invoices/q3.pdf t3://acme-bucket/reports/q3.pdf --region=iad'
    );
    expect(props.flags).toEqual(['region']);
  });

  // The hard guarantee. Asserted against the whole serialized payload so no
  // property — present or added later — can carry a credential.
  it.each([
    [
      '--access-key flag value',
      ['configure', '--access-key', 'tid_LIVEKEY123'],
    ],
    [
      '--access-secret flag value',
      ['configure', '--access-secret', 'supersecretvalue'],
    ],
    ['--secret= inline form', ['configure', '--secret=supersecretvalue']],
    ['a Tigris secret in a positional', ['ls', 'tsec_LIVESECRET456']],
    ['an AWS access key id', ['cp', 'AKIAIOSFODNN7EXAMPLE', 't3://b/k']],
    [
      'a JWT',
      [
        'ls',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      ],
    ],
    ['a bearer token', ['ls', '--token', 'Bearer abc123def456']],
  ])('never sends credentials: %s', async (_label, args) => {
    process.argv = ['node', 'tigris', ...args];
    await captureCommand([args[0]]);

    const serialized = sentBodies[0];
    for (const secret of [
      'tid_LIVEKEY123',
      'supersecretvalue',
      'tsec_LIVESECRET456',
      'AKIAIOSFODNN7EXAMPLE',
      'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'abc123def456',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('[redacted]');
  });

  it("redacts other people's email addresses from arguments", async () => {
    process.argv = ['node', 'tigris', 'iam', 'users', 'invite', 'bob@corp.io'];
    await captureCommand(['iam', 'users', 'invite']);

    const serialized = sentBodies[0];
    expect(serialized).not.toContain('bob@corp.io');
    expect(JSON.parse(serialized).properties.command_args).toContain(
      '[redacted]'
    );
  });

  it('never sends the machine hostname or working directory', async () => {
    process.argv = ['node', 'tigris', 'ls'];
    await captureCommand(['ls']);

    const serialized = sentBodies[0];
    expect(serialized).not.toContain(hostname());
    expect(serialized).not.toContain(process.cwd());
  });

  it.each([
    ['TIGRIS_NO_TELEMETRY', '1'],
    ['DO_NOT_TRACK', '1'],
    ['TIGRIS_ENV', 'development'],
  ])('sends nothing when %s=%s', async (name, value) => {
    process.env[name] = value;
    await captureCommand(['ls']);
    expect(sentBodies).toHaveLength(0);
  });

  it('uses an anonymous uuid as distinct_id when not signed in', async () => {
    await captureCommand(['ls']);

    const body = JSON.parse(sentBodies[0]);
    expect(body.distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(body.properties.auth_method).toBe('none');
    expect(body.properties.$groups).toBeUndefined();
  });

  // Email as distinct_id is deliberate: it is what the console aliases to, so
  // CLI and web activity land on one person record.
  it('uses the signed-in email as distinct_id and groups by organization', async () => {
    identity.idToken = `header.${Buffer.from(
      JSON.stringify({ email: 'alice@example.com' })
    ).toString('base64url')}.sig`;
    identity.loginMethod = 'oauth';
    identity.organizationId = 'org_123';

    await captureCommand(['ls']);

    const body = JSON.parse(sentBodies[0]);
    expect(body.distinct_id).toBe('alice@example.com');
    expect(body.properties.auth_method).toBe('oauth');
    expect(body.properties.$groups).toEqual({ company: 'org_123' });
    // Person properties stay namespaced so CLI events never clobber the
    // console-owned `email` / `name` fields.
    expect(
      Object.keys(body.properties.$set).every((k) => k.startsWith('cli_'))
    ).toBe(true);
  });

  it('falls back to anonymous when the stored token carries no email', async () => {
    identity.idToken = 'garbage-not-a-jwt';
    identity.loginMethod = 'credentials';

    await captureCommand(['ls']);

    const body = JSON.parse(sentBodies[0]);
    expect(body.distinct_id).not.toContain('@');
    expect(body.properties.auth_method).toBe('credentials');
  });
});

describe('identifyOnLogin', () => {
  it('merges the anonymous machine id into the signed-in person', async () => {
    identity.idToken = `header.${Buffer.from(
      JSON.stringify({ email: 'alice@example.com' })
    ).toString('base64url')}.sig`;
    identity.loginMethod = 'oauth';

    await identifyOnLogin();

    expect(sentBodies).toHaveLength(1);
    const body = JSON.parse(sentBodies[0]);
    expect(body.event).toBe('$identify');
    expect(body.distinct_id).toBe('alice@example.com');
    // This is what stitches pre-login CLI activity to the user.
    expect(body.properties.$anon_distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-/
    );
    expect(body.properties.$set.email).toBe('alice@example.com');
  });

  it('does nothing when there is no signed-in identity to link', async () => {
    await identifyOnLogin();
    expect(sentBodies).toHaveLength(0);
  });
});

describe('trackCommand', () => {
  it('does not report the telemetry command itself', async () => {
    trackCommand(['telemetry', 'disable']);
    await flush();
    expect(sentBodies).toHaveLength(0);

    // Positive control: an ordinary command on the same path does report, so
    // the assertion above cannot pass vacuously.
    trackCommand(['ls']);
    await flush();
    expect(sentBodies).toHaveLength(1);
    expect(JSON.parse(sentBodies[0]).properties.command).toBe('ls');
  });
});
