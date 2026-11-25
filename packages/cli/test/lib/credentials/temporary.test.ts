import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/auth/provider.js')>()),
  resolveAuthMethod: vi.fn(),
  resolveEndpoints: vi.fn(),
}));
vi.mock('@tigrisdata/iam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tigrisdata/iam')>()),
  createAccessKey: vi.fn(),
  createTemporaryCredentials: vi.fn(),
  removeAccessKey: vi.fn(async () => ({ data: undefined })),
}));
vi.mock('@auth/iam.js', () => ({
  getOAuthIAMConfig: vi.fn(async () => ({ sessionToken: 'oauth' })),
}));
vi.mock('enquirer', () => ({ default: { prompt: vi.fn() } }));

import { resolveAuthMethod, resolveEndpoints } from '@auth/provider.js';
import {
  createAccessKey,
  createTemporaryCredentials,
  removeAccessKey,
} from '@tigrisdata/iam';
import enquirer from 'enquirer';
import temporary, {
  parseDuration,
  roleFor,
} from '../../../src/lib/credentials/temporary.js';
import type { Specs } from '../../../src/types.js';
import { setSpecs } from '../../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

const issued = {
  accessKeyId: 'tsid_AaBb',
  secretAccessKey: 'tssec_XxYy',
  sessionToken: 'tsts1Token',
  expiration: new Date('2026-11-24T12:00:00Z'),
  federatedUser: {
    id: 'to_org:ci',
    arn: 'arn:aws:sts::to_org:federated-user/ci',
  },
};

class ExitSignal extends Error {}

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  vi.clearAllMocks();
  stdout = [];
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.join(' '));
  });
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitSignal();
  });
  vi.stubEnv('AWS_ENDPOINT_URL_STS', '');
  vi.mocked(resolveAuthMethod).mockResolvedValue({
    type: 'environment',
    accessKeyId: 'tid_key',
    secretAccessKey: 'tsec_key',
    source: 'tigris',
  });
  vi.mocked(resolveEndpoints).mockResolvedValue({
    storage: 'https://t3.storage.dev',
    iam: 'https://iam.storageapi.dev',
  });
  vi.mocked(createTemporaryCredentials).mockResolvedValue({ data: issued });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const run = (options: Record<string, unknown>) =>
  temporary({ bucket: 'my-bucket', name: 'ci', access: 'read', ...options });

/** Run a command that is expected to fail; return what it printed. */
async function fails(options: Record<string, unknown>): Promise<string> {
  await expect(run(options)).rejects.toBeInstanceOf(ExitSignal);
  return stderr.join('\n');
}

describe('credentials temporary', () => {
  it('issues credentials for the bucket with the issuing access key', async () => {
    await run({});

    expect(createTemporaryCredentials).toHaveBeenCalledWith('ci', {
      config: { accessKeyId: 'tid_key', secretAccessKey: 'tsec_key' },
      durationSeconds: 3600,
      bucket: 'my-bucket',
      access: 'read',
    });
  });

  it('prints the credentials and their expiry', async () => {
    await run({});

    const out = stdout.join('\n');
    expect(out).toContain('Access Key ID: tsid_AaBb');
    expect(out).toContain('Secret Access Key: tssec_XxYy');
    expect(out).toContain('Session Token: tsts1Token');
    expect(out).toContain('Expires: 2026-11-24T12:00:00.000Z');
  });

  it('passes exact actions, split on commas', async () => {
    await run({ access: undefined, actions: 's3:GetObject, s3:ListBucket' });

    expect(createTemporaryCredentials).toHaveBeenCalledWith(
      'ci',
      expect.objectContaining({
        actions: ['s3:GetObject', 's3:ListBucket'],
      })
    );
  });

  it('reads a policy file instead of a bucket and access level', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tigris-temporary-'));
    const path = join(dir, 'policy.json');
    writeFileSync(
      path,
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:GetObject'],
            Resource: 'arn:aws:s3:::b/*',
          },
        ],
      })
    );

    await run({ bucket: undefined, access: undefined, policy: path });

    const options = vi.mocked(createTemporaryCredentials).mock.calls[0][1];
    expect(options?.bucket).toBeUndefined();
    expect(options?.policy).toEqual({
      version: '2012-10-17',
      statements: [
        {
          effect: 'Allow',
          action: ['s3:GetObject'],
          resource: 'arn:aws:s3:::b/*',
        },
      ],
    });
  });

  it('uses AWS_ENDPOINT_URL_STS when set', async () => {
    vi.stubEnv('AWS_ENDPOINT_URL_STS', 'https://sts.example.com');

    await run({});

    expect(
      vi.mocked(createTemporaryCredentials).mock.calls[0][1]?.config
    ).toMatchObject({ stsEndpoint: 'https://sts.example.com' });
  });

  it('prints only export lines with --export, session token included', async () => {
    await run({ export: true, for: 'aws' });

    expect(stdout).toHaveLength(1);
    const lines = stdout[0].split('\n');
    expect(lines).toContain("export AWS_ACCESS_KEY_ID='tsid_AaBb'");
    expect(lines).toContain("export AWS_SECRET_ACCESS_KEY='tssec_XxYy'");
    expect(lines).toContain("export AWS_SESSION_TOKEN='tsts1Token'");
    expect(lines).toContain(
      "export AWS_ENDPOINT_URL_S3='https://t3.storage.dev'"
    );
  });

  it('writes the Tigris variables with the bucket by default', async () => {
    await run({ export: true });

    expect(stdout[0].split('\n')).toEqual([
      "export TIGRIS_STORAGE_ACCESS_KEY_ID='tsid_AaBb'",
      "export TIGRIS_STORAGE_SECRET_ACCESS_KEY='tssec_XxYy'",
      "export TIGRIS_STORAGE_SESSION_TOKEN='tsts1Token'",
      "export TIGRIS_STORAGE_BUCKET='my-bucket'",
    ]);
  });

  it('prints JSON with --format json', async () => {
    await run({ format: 'json' });

    expect(JSON.parse(stdout[stdout.length - 1])).toEqual({
      action: 'issued',
      name: 'ci',
      bucket: 'my-bucket',
      accessKeyId: 'tsid_AaBb',
      secretAccessKey: 'tssec_XxYy',
      sessionToken: 'tsts1Token',
      expiration: '2026-11-24T12:00:00.000Z',
      federatedUser: issued.federatedUser,
    });
  });

  it('reports the error the SDK returns', async () => {
    vi.mocked(createTemporaryCredentials).mockResolvedValue({
      error: new Error('Statement 0: only Effect Allow is supported'),
    });

    expect(await fails({})).toContain(
      'Statement 0: only Effect Allow is supported'
    );
    // The access key was the user's own; only a key created here is deleted.
    expect(removeAccessKey).not.toHaveBeenCalled();
  });

  describe('refuses before issuing anything', () => {
    it.each([
      ['without --name', { name: undefined }, '--name is required'],
      [
        'with nothing to grant',
        { access: undefined },
        'Choose what to grant with --access, --actions or --policy',
      ],
      [
        'with a duration under 15m',
        { duration: '10m' },
        'Invalid --duration "10m"',
      ],
      [
        'with a duration over 36h',
        { duration: '37h' },
        'Invalid --duration "37h"',
      ],
      [
        'with an unreadable duration',
        { duration: '1d' },
        'Invalid --duration "1d"',
      ],
      [
        'with an unknown --for',
        { export: true, for: 'gcp' },
        'Invalid --for "gcp"',
      ],
      [
        'with --export and JSON',
        { export: true, format: 'json' },
        'Cannot combine --export with --format json',
      ],
      [
        'with --policy and --access',
        { policy: '/any/policy.json' },
        "--policy can't be combined with a bucket, --access or --actions",
      ],
      [
        'with a missing policy file',
        {
          bucket: undefined,
          access: undefined,
          policy: '/nonexistent/policy.json',
        },
        'Could not read --policy /nonexistent/policy.json',
      ],
    ])('%s', async (_, options, message) => {
      expect(await fails(options)).toContain(message);
      expect(createTemporaryCredentials).not.toHaveBeenCalled();
    });

    it('when already using temporary credentials', async () => {
      vi.mocked(resolveAuthMethod).mockResolvedValue({
        type: 'environment',
        accessKeyId: 'tsid_a',
        secretAccessKey: 'tssec_a',
        sessionToken: 'tsts1',
        source: 'aws',
      });

      expect(await fails({})).toContain(
        'You are using temporary credentials, which cannot issue more'
      );
      expect(createTemporaryCredentials).not.toHaveBeenCalled();
    });
  });
});

describe('credentials temporary, logged in with OAuth', () => {
  let stdinTTY: boolean | undefined;
  let stderrTTY: boolean | undefined;

  beforeEach(() => {
    stdinTTY = process.stdin.isTTY;
    stderrTTY = process.stderr.isTTY;
    process.stdin.isTTY = true;
    process.stderr.isTTY = true;
    vi.mocked(resolveAuthMethod).mockResolvedValue({ type: 'oauth' });
    vi.mocked(createAccessKey).mockResolvedValue({
      data: { id: 'tid_new', name: 'ci', secret: 'tsec_new' },
    } as Awaited<ReturnType<typeof createAccessKey>>);
  });

  afterEach(() => {
    process.stdin.isTTY = stdinTTY as boolean;
    process.stderr.isTTY = stderrTTY as boolean;
  });

  const choose = (choice: string) =>
    vi.mocked(enquirer.prompt).mockResolvedValue({ choice });

  it('creates an access key for the bucket and issues with it', async () => {
    choose('create');

    await run({});

    expect(createAccessKey).toHaveBeenCalledWith('ci', {
      config: { sessionToken: 'oauth' },
      bucketsRole: [{ bucket: 'my-bucket', role: 'ReadOnly' }],
      scope: 'no_default_allow',
    });
    expect(createTemporaryCredentials).toHaveBeenCalledWith(
      'ci',
      expect.objectContaining({
        config: { accessKeyId: 'tid_new', secretAccessKey: 'tsec_new' },
      })
    );
  });

  it('says the key must outlive the credentials and how to delete it', async () => {
    choose('create');

    await run({});

    const err = stderr.join('\n');
    expect(err).toContain(
      'Created access key ci (tid_new), ReadOnly on my-bucket'
    );
    expect(err).toContain('Deleting it ends them');
    expect(err).toContain('tigris access-keys delete tid_new');
  });

  it('prompts on stderr, keeping stdout for --export', async () => {
    choose('create');

    await run({ export: true });

    expect(vi.mocked(enquirer.prompt).mock.calls[0][0]).toMatchObject({
      stdout: process.stderr,
    });
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("TIGRIS_STORAGE_ACCESS_KEY_ID='tsid_AaBb'");
  });

  it('names the created key in JSON', async () => {
    choose('create');

    await run({ format: 'json' });

    expect(JSON.parse(stdout[stdout.length - 1]).createdAccessKey).toEqual({
      id: 'tid_new',
      name: 'ci',
    });
  });

  it('stops when the user cancels', async () => {
    choose('cancel');

    expect(await fails({})).toContain('tigris login credentials');
    expect(createAccessKey).not.toHaveBeenCalled();
    expect(createTemporaryCredentials).not.toHaveBeenCalled();
  });

  it('fails without a terminal to ask in', async () => {
    process.stdin.isTTY = false;

    expect(await fails({})).toContain(
      'You are logged in with OAuth. Temporary credentials have to be issued by an access key.'
    );
    expect(enquirer.prompt).not.toHaveBeenCalled();
    expect(createAccessKey).not.toHaveBeenCalled();
  });

  it('fails with --policy, which can name any bucket', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tigris-temporary-'));
    const path = join(dir, 'policy.json');
    writeFileSync(
      path,
      JSON.stringify({ Version: '2012-10-17', Statement: [] })
    );

    expect(
      await fails({ bucket: undefined, access: undefined, policy: path })
    ).toContain('tigris login credentials');
    expect(enquirer.prompt).not.toHaveBeenCalled();
  });

  it('deletes the created key when nothing is issued', async () => {
    choose('create');
    vi.mocked(createTemporaryCredentials).mockResolvedValue({
      error: new Error('Statement 0: only Effect Allow is supported'),
    });

    expect(await fails({})).toContain('Deleted access key tid_new');
    expect(removeAccessKey).toHaveBeenCalledWith('tid_new', {
      config: { sessionToken: 'oauth' },
    });
  });

  it('names a created key it could not delete', async () => {
    choose('create');
    vi.mocked(createTemporaryCredentials).mockResolvedValue({
      error: new Error('Statement 0: only Effect Allow is supported'),
    });
    vi.mocked(removeAccessKey).mockResolvedValueOnce({
      error: new Error('Access Denied'),
    });

    expect(await fails({})).toContain('tigris access-keys delete tid_new');
  });

  it('reports a key that could not be created', async () => {
    choose('create');
    vi.mocked(createAccessKey).mockResolvedValue({
      error: new Error('Access Denied'),
    });

    expect(await fails({})).toContain('Access Denied');
    expect(createTemporaryCredentials).not.toHaveBeenCalled();
  });
});

describe('roleFor', () => {
  it.each([
    ['read', undefined, 'ReadOnly'],
    ['write', undefined, 'ReadWrite'],
    ['readwrite', undefined, 'ReadWrite'],
    [undefined, ['s3:GetObject', 's3:ListBucket'], 'ReadOnly'],
    [undefined, ['s3:GetObject', 's3:PutObject'], 'ReadWrite'],
    ['read', ['s3:DeleteObject'], 'ReadWrite'],
  ])('%s %j needs %s', (access, actions, role) => {
    expect(roleFor(access, actions)).toBe(role);
  });
});

describe('parseDuration', () => {
  it.each([
    ['3600', 3600],
    ['90s', 90],
    ['30m', 1800],
    ['1h', 3600],
    ['36H', 129_600],
    [' 15m ', 900],
  ])('reads %s', (value, seconds) => {
    expect(parseDuration(value)).toBe(seconds);
  });

  it.each(['', '1d', '1h30m', '-1h', 'h', '1.5h'])('rejects "%s"', (value) => {
    expect(parseDuration(value)).toBeUndefined();
  });
});
