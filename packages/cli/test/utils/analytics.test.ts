import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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

import type { Specs } from '../../src/types.js';

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
  const requestMock = (...args: unknown[]) => {
    const callback = args.find((a) => typeof a === 'function') as
      | ((res: unknown) => void)
      | undefined;
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

// The detached sender child is the transport. Stand in for it at the spawn
// boundary: read the payload file it would be handed, record each request it
// would POST, and delete the file as the child does.
const { spawns } = vi.hoisted(() => ({
  spawns: {
    fail: false,
    calls: [] as Array<{
      command: string;
      args: string[];
      options: Record<string, unknown>;
      mode: number;
      urls: string[];
    }>,
  },
}));

vi.mock('node:child_process', async () => {
  const fs = await import('node:fs');
  return {
    spawn: (
      command: string,
      args: string[],
      options: Record<string, unknown>
    ) => {
      const file = args[args.length - 1];
      const child = {
        pid: 4242 as number | undefined,
        on: () => child,
        unref: () => {},
      };
      if (spawns.fail) {
        child.pid = undefined;
        return child;
      }
      const mode = fs.statSync(file).mode & 0o777;
      const batch = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{
        url: string;
        body: string;
      }>;
      fs.unlinkSync(file);
      spawns.calls.push({
        command,
        args,
        options,
        mode,
        urls: batch.map((r) => r.url),
      });
      for (const request of batch) {
        sentBodies.push(request.body);
      }
      return child;
    },
  };
});

const {
  decodeTokenEmail,
  errorCodeOf,
  finishCommand,
  identifyOnLogin,
  isCI,
  resetCommandTrackingForTesting,
  trackCommand,
  usedFlags,
} = await import('../../src/utils/analytics.js');
const { sendQueuedTelemetry, TELEMETRY_SEND_COMMAND } = await import(
  '../../src/utils/telemetry-sender.js'
);
const { createProgram } = await import('../../src/cli-core.js');
const { exitWithError } = await import('../../src/utils/exit.js');

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

/** Payload files currently in the temp dir. */
function tigrisTempFiles(): string[] {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith('tigris-telemetry-'))
    .sort();
}

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

/** Thrown by the process.exit stub so an exit halts the caller, as it would. */
class ExitCalled extends Error {
  constructor(readonly code: unknown) {
    super(`process.exit(${String(code)})`);
  }
}

let exitStub: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spawns.fail = false;
  spawns.calls.length = 0;
  process.exitCode = undefined;
  exitStub = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitCalled(code);
  });
  // exitWithError and commander print the failure; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  // Unhook first, so restoring the spies restores the real process.exit.
  resetCommandTrackingForTesting();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

/** Track a run, let the stored login be read, then end it with `exitCode`. */
async function capture(commandPath: string[], exitCode = 0) {
  trackCommand(commandPath);
  await flush();
  finishCommand(exitCode);
}

function lastEvent() {
  expect(sentBodies.length).toBeGreaterThan(0);
  return JSON.parse(sentBodies[sentBodies.length - 1]);
}

describe('cli_command event', () => {
  it('sends a cli_command event with the canonical command path', async () => {
    process.argv = ['node', 'tigris', 'buckets', 'create', 'x', '--json'];
    await capture(['buckets', 'create']);

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

  it('records a successful outcome and keeps every existing property', async () => {
    process.argv = ['node', 'tigris', 'ls', 'my-bucket', '--json'];
    await capture(['ls']);

    const { properties } = lastEvent();
    expect(properties.success).toBe(true);
    expect(properties.exit_code).toBe(0);
    expect(typeof properties.duration_ms).toBe('number');
    expect(properties.duration_ms).toBeGreaterThanOrEqual(0);
    expect(properties).not.toHaveProperty('error_category');
    expect(properties).not.toHaveProperty('error_code');
    for (const key of [
      'command',
      'command_root',
      'command_args',
      'flags',
      'auth_method',
      'json_mode',
      'interface',
      'cli_version',
      'runtime',
      'install_method',
      'node_version',
      'os',
      'arch',
      'is_ci',
      'is_tty',
      '$set',
    ]) {
      expect(properties).toHaveProperty(key);
    }
    expect(properties.$set_once).toEqual({
      first_interface: 'cli',
      first_cli_install_method: properties.install_method,
      first_cli_version: properties.cli_version,
    });
  });

  it('hands the event to a detached sender child, pointed at the configured host', async () => {
    process.env.TIGRIS_POSTHOG_HOST = 'http://127.0.0.1:9';
    process.argv = ['/usr/bin/node', '/opt/tigris/dist/cli.js', 'ls'];
    try {
      await capture(['ls']);
    } finally {
      delete process.env.TIGRIS_POSTHOG_HOST;
    }
    expect(spawns.calls).toHaveLength(1);
    const [call] = spawns.calls;
    expect(call.command).toBe(process.execPath);
    expect(call.args.slice(0, 2)).toEqual([
      '/opt/tigris/dist/cli.js',
      TELEMETRY_SEND_COMMAND,
    ]);
    // A private, uniquely named file in the temp dir.
    const file = call.args[2];
    expect(file.startsWith(tmpdir())).toBe(true);
    expect(file).toMatch(/tigris-telemetry-\d+-[0-9a-f]{16}\.json$/);
    expect(call.mode).toBe(0o600);
    expect(call.options).toMatchObject({
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    expect(call.urls).toEqual(['http://127.0.0.1:9/i/v0/e/']);
  });

  it('launches the compiled binary as itself', async () => {
    (globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY = true;
    try {
      await capture(['ls']);
    } finally {
      delete (globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY;
    }
    const [call] = spawns.calls;
    expect(call.command).toBe(process.execPath);
    expect(call.args[0]).toBe(TELEMETRY_SEND_COMMAND);
  });

  it('posts in-process and leaves no file behind when the child cannot start', async () => {
    spawns.fail = true;
    const before = tigrisTempFiles();
    await capture(['ls']);
    await flush();
    expect(lastEvent().properties.success).toBe(true);
    expect(tigrisTempFiles()).toEqual(before);
  });

  it('sends once per run, however many paths try to end it', async () => {
    await capture(['ls']);
    finishCommand(1);
    expect(sentBodies).toHaveLength(1);
    expect(spawns.calls).toHaveLength(1);
    expect(lastEvent().properties.exit_code).toBe(0);
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
    await capture(['cp']);

    const props = lastEvent().properties;
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
    await capture([args[0]]);

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
    await capture(['iam', 'users', 'invite']);

    const serialized = sentBodies[0];
    expect(serialized).not.toContain('bob@corp.io');
    expect(JSON.parse(serialized).properties.command_args).toContain(
      '[redacted]'
    );
  });

  it('never sends the machine hostname or working directory', async () => {
    process.argv = ['node', 'tigris', 'ls'];
    await capture(['ls']);

    const serialized = sentBodies[0];
    expect(serialized).not.toContain(hostname());
    expect(serialized).not.toContain(process.cwd());
  });

  it.each([
    ['TIGRIS_NO_TELEMETRY', '1'],
    ['DO_NOT_TRACK', '1'],
    ['TIGRIS_ENV', 'development'],
  ])('sends nothing and hooks nothing when %s=%s', async (name, value) => {
    process.env[name] = value;
    const before = tigrisTempFiles();
    await capture(['ls']);
    expect(sentBodies).toHaveLength(0);
    expect(spawns.calls).toHaveLength(0);
    expect(tigrisTempFiles()).toEqual(before);
    expect(process.exit).toBe(exitStub);
  });

  it('uses an anonymous uuid as distinct_id when not signed in', async () => {
    await capture(['ls']);

    const body = lastEvent();
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

    await capture(['ls']);

    const body = lastEvent();
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

    await capture(['ls']);

    const body = lastEvent();
    expect(body.distinct_id).not.toContain('@');
    expect(body.properties.auth_method).toBe('credentials');
  });

  it('still sends when the run ends before the login is read', () => {
    trackCommand(['ls']);
    finishCommand(1);

    const body = lastEvent();
    expect(body.properties.auth_method).toBe('unknown');
    expect(body.distinct_id).toMatch(/^[0-9a-f]{8}-/);
  });
});

describe('errorCodeOf', () => {
  it.each([
    ['an S3 error name', Object.assign(new Error('x'), { name: 'NoSuchKey' })],
    ['an AWS Code', Object.assign(new Error('x'), { Code: 'NoSuchKey' })],
    ['a Node errno', Object.assign(new Error('x'), { code: 'NoSuchKey' })],
  ])('reads %s', (_label, error) => {
    expect(errorCodeOf(error)).toBe('NoSuchKey');
  });

  it('ignores generic constructor names and anything shaped like a message', () => {
    expect(errorCodeOf(new Error('bucket my-bucket exists'))).toBeUndefined();
    expect(errorCodeOf(new TypeError('x'))).toBeUndefined();
    expect(errorCodeOf({ code: 'bucket my-bucket exists' })).toBeUndefined();
    expect(errorCodeOf('ENOTFOUND')).toBeUndefined();
    expect(errorCodeOf(undefined)).toBeUndefined();
  });
});

describe('outcomes through the dispatcher', () => {
  const TEST_SPECS = {
    name: 'tigris',
    description: 'test',
    commands: [
      {
        name: 'buckets',
        description: 'buckets',
        commands: [
          {
            name: 'create',
            description: 'create',
            arguments: [
              { name: 'name', type: 'positional', required: true },
              { name: 'region', description: 'region', required: true },
            ],
          },
        ],
      },
    ],
  } as unknown as Specs;

  /**
   * Run the real dispatcher with `impl` as the command. Returns the exit code
   * if anything called process.exit(), or undefined if the command returned.
   */
  async function run(
    argv: string[],
    impl: () => unknown = () => {}
  ): Promise<unknown> {
    process.argv = ['node', 'tigris', ...argv];
    const program = createProgram({
      specs: TEST_SPECS,
      version: '0.0.0-test',
      loadModule: async () => ({ module: { default: impl }, error: null }),
      hasImplementation: () => true,
    });
    try {
      await program.parseAsync(process.argv);
      return undefined;
    } catch (error) {
      if (error instanceof ExitCalled) {
        return error.code;
      }
      // An escaped error reaches the unhandledRejection handler in
      // setupErrorHandlers(), which ends in exactly this call.
      try {
        exitWithError(error, undefined, { skipCapture: true });
      } catch (exit) {
        if (exit instanceof ExitCalled) {
          return exit.code;
        }
        throw exit;
      }
    }
  }

  it('records success when the command returns', async () => {
    expect(await run(['buckets', 'create', 'b1', '--region', 'iad'])).toBe(
      undefined
    );
    const { properties } = lastEvent();
    expect(properties.command).toBe('buckets create');
    expect(properties.success).toBe(true);
    expect(properties.exit_code).toBe(0);
  });

  it('records failure when the command returns with process.exitCode set', async () => {
    await run(['buckets', 'create', 'b1', '--region', 'iad'], () => {
      process.exitCode = 1;
    });
    const { properties } = lastEvent();
    expect(properties.success).toBe(false);
    expect(properties.exit_code).toBe(1);
    expect(properties.error_category).toBe('general');
  });

  it('records success when the command ends with process.exit(0)', async () => {
    const code = await run(['buckets', 'create', 'b1', '--region', 'iad'], () =>
      process.exit(0)
    );
    expect(code).toBe(0);
    expect(sentBodies).toHaveLength(1);
    const { properties } = lastEvent();
    expect(properties.success).toBe(true);
    expect(properties.exit_code).toBe(0);
  });

  it('records the category and S3 code from exitWithError, never the message', async () => {
    const code = await run(['buckets', 'create', 'b1', '--region', 'iad'], () =>
      exitWithError(
        Object.assign(new Error('The specified key does not exist'), {
          name: 'NoSuchKey',
        })
      )
    );
    expect(code).toBe(3);
    const { properties } = lastEvent();
    expect(properties.success).toBe(false);
    expect(properties.exit_code).toBe(3);
    expect(properties.error_category).toBe('not_found');
    expect(properties.error_code).toBe('NoSuchKey');
    expect(sentBodies[0]).not.toContain('specified key');
  });

  it('records a thrown error', async () => {
    const code = await run(
      ['buckets', 'create', 'b1', '--region', 'iad'],
      async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:443');
      }
    );
    expect(code).toBe(5);
    const { properties } = lastEvent();
    expect(properties.success).toBe(false);
    expect(properties.exit_code).toBe(5);
    expect(properties.error_category).toBe('network');
    expect(properties).not.toHaveProperty('error_code');
    expect(sentBodies[0]).not.toContain('ECONNREFUSED');
  });

  it('records a missing required option (local validation)', async () => {
    expect(await run(['buckets', 'create', 'b1'])).toBe(1);
    const { properties } = lastEvent();
    expect(properties.command).toBe('buckets create');
    expect(properties.success).toBe(false);
    expect(properties.error_category).toBe('usage');
    expect(properties.error_code).toBe('missing_required_argument');
  });

  it('records an unknown flag caught by commander', async () => {
    expect(
      await run(['buckets', 'create', 'b1', '--region', 'iad', '--bogus'])
    ).toBe(1);
    const { properties } = lastEvent();
    expect(properties.command).toBe('buckets create');
    expect(properties.error_category).toBe('usage');
    expect(properties.error_code).toBe('commander.unknownOption');
  });

  it('records an unknown subcommand under its parent', async () => {
    expect(await run(['buckets', 'frobnicate'])).toBe(1);
    const { properties } = lastEvent();
    expect(properties.command).toBe('buckets');
    expect(properties.error_code).toBe('unknown_command');
  });

  it('records an unknown top-level command without echoing it as the command', async () => {
    expect(await run(['frobnicate'])).toBe(1);
    const { properties } = lastEvent();
    expect(properties.command).toBe('(unknown)');
    expect(properties.error_code).toBe('unknown_command');
  });

  it('does not track help', async () => {
    expect(await run(['buckets', 'create', '--help'])).toBe(0);
    expect(sentBodies).toHaveLength(0);
  });
});

describe('Ctrl-C', () => {
  it('records an interrupted run and re-raises SIGINT', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    trackCommand(['cp']);
    process.emit('SIGINT');

    const { properties } = lastEvent();
    expect(properties.success).toBe(false);
    expect(properties.exit_code).toBe(130);
    expect(properties.error_category).toBe('interrupted');
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT');
    // The listener is gone, so the re-raised signal takes the default action.
    expect(process.listenerCount('SIGINT')).toBe(0);
  });

  it('leaves Ctrl-C to a command that handles it itself', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const own = () => {};
    trackCommand(['buckets', 'migrate']);
    process.on('SIGINT', own);
    try {
      process.emit('SIGINT');
      expect(sentBodies).toHaveLength(0);
      expect(kill).not.toHaveBeenCalled();
    } finally {
      process.removeListener('SIGINT', own);
    }
  });

  it('reports interrupted when a self-handling command then exits non-zero', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const own = () => {};
    trackCommand(['buckets', 'migrate']);
    process.on('SIGINT', own);
    try {
      process.emit('SIGINT');
      finishCommand(1);
      const { properties } = lastEvent();
      expect(properties.success).toBe(false);
      expect(properties.exit_code).toBe(1);
      expect(properties.error_category).toBe('interrupted');
    } finally {
      process.removeListener('SIGINT', own);
    }
  });
});

describe('identifyOnLogin', () => {
  it('merges the anonymous machine id into the signed-in person', async () => {
    identity.idToken = `header.${Buffer.from(
      JSON.stringify({ email: 'alice@example.com' })
    ).toString('base64url')}.sig`;
    identity.loginMethod = 'oauth';

    await identifyOnLogin();
    // Queued, not sent: it rides along with the command's own event.
    expect(sentBodies).toHaveLength(0);
    sendQueuedTelemetry();

    expect(sentBodies).toHaveLength(1);
    const body = JSON.parse(sentBodies[0]);
    expect(body.event).toBe('$identify');
    expect(body.distinct_id).toBe('alice@example.com');
    // This is what stitches pre-login CLI activity to the user.
    expect(body.properties.$anon_distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-/
    );
    expect(body.properties.$set.email).toBe('alice@example.com');
    expect(body.properties.$set.cli_version).toBe(body.properties.cli_version);
  });

  it('sets the first-touch surface once', async () => {
    identity.idToken = `header.${Buffer.from(
      JSON.stringify({ email: 'alice@example.com' })
    ).toString('base64url')}.sig`;
    identity.loginMethod = 'oauth';

    await identifyOnLogin();
    sendQueuedTelemetry();

    const { properties } = JSON.parse(sentBodies[0]);
    expect(properties.$set_once).toEqual({
      first_interface: 'cli',
      first_cli_install_method: properties.install_method,
      first_cli_version: properties.cli_version,
    });
  });

  it('does nothing when there is no signed-in identity to link', async () => {
    await identifyOnLogin();
    sendQueuedTelemetry();
    expect(sentBodies).toHaveLength(0);
  });
});

describe('trackCommand', () => {
  it('does not report the telemetry command itself', async () => {
    await capture(['telemetry', 'disable']);
    expect(sentBodies).toHaveLength(0);
    expect(process.exit).toBe(exitStub);

    // Positive control: an ordinary command on the same path does report, so
    // the assertion above cannot pass vacuously.
    resetCommandTrackingForTesting();
    await capture(['ls']);
    expect(sentBodies).toHaveLength(1);
    expect(JSON.parse(sentBodies[0]).properties.command).toBe('ls');
  });
});
