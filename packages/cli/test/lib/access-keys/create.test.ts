import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/iam.js', () => ({
  getIAMConfig: vi.fn(async () => ({})),
}));
vi.mock('@auth/provider.js', () => ({
  resolveEndpoints: vi.fn(),
}));
vi.mock('@tigrisdata/iam', () => ({
  ACCESS_KEY_ROLES: ['Editor', 'ReadWrite', 'ReadOnly', 'NamespaceAdmin'],
  createAccessKey: vi.fn(),
}));

import { resolveEndpoints } from '@auth/provider.js';
import { createAccessKey } from '@tigrisdata/iam';
import create from '../../../src/lib/access-keys/create.js';
import type { Specs } from '../../../src/types.js';
import { setSpecs } from '../../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

const created = {
  id: 'tid_AaBb',
  name: 'my-app',
  secret: 'tsec_XxYy',
  createdAt: new Date(),
  status: 'active' as const,
  roles: [],
};

class ExitSignal extends Error {}

let stdout: string[];
let stderr: string[];
let cwd: string;

beforeEach(() => {
  // restoreAllMocks() below only restores spies; the vi.fn() mocks keep
  // their call history unless cleared.
  vi.clearAllMocks();
  stdout = [];
  stderr = [];
  cwd = mkdtempSync(join(tmpdir(), 'tigris-create-key-'));
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.join(' '));
  });
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitSignal();
  });
  vi.mocked(createAccessKey).mockResolvedValue({ data: created });
  vi.mocked(resolveEndpoints).mockResolvedValue({
    storage: 'https://t3.storage.dev',
    iam: 'https://iam.storageapi.dev',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const run = (options: Record<string, unknown>) =>
  create({ name: 'my-app', ...options });

describe('access-keys create', () => {
  it('prints the secret once when nothing exports it', async () => {
    await run({});
    expect(createAccessKey).toHaveBeenCalledWith('my-app', {
      config: {},
      bucketsRole: undefined,
    });
    expect(stdout.join('\n')).toContain('Secret Access Key: tsec_XxYy');
    expect(stdout.join('\n')).toContain('will not be shown again');
    // The plain path is what it always was: no endpoint lookup at all.
    expect(resolveEndpoints).not.toHaveBeenCalled();
  });

  it('scopes the key at creation from --bucket and --role', async () => {
    await run({ bucket: ['a', 'b'], role: ['Editor', 'ReadOnly'] });
    expect(createAccessKey).toHaveBeenCalledWith('my-app', {
      config: {},
      bucketsRole: [
        { bucket: 'a', role: 'Editor' },
        { bucket: 'b', role: 'ReadOnly' },
      ],
    });
    expect(stdout.join('\n')).toContain('Roles: Editor on a, ReadOnly on b');
  });

  it('rejects --admin combined with --bucket or --role', async () => {
    await expect(run({ admin: true, bucket: 'a' })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('cannot be combined with --bucket');
    expect(createAccessKey).not.toHaveBeenCalled();
  });

  it('rejects a role without a bucket, pointing at --admin', async () => {
    await expect(run({ role: 'Editor' })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain(
      'At least one bucket name is required (or use --admin)'
    );
    expect(createAccessKey).not.toHaveBeenCalled();
  });

  it('writes the dotenv file instead of printing the secret', async () => {
    await run({ bucket: 'my-app', role: 'Editor', env: true });
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toBe(
      'TIGRIS_STORAGE_ACCESS_KEY_ID=tid_AaBb\n' +
        'TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_XxYy\n' +
        'TIGRIS_STORAGE_BUCKET=my-app\n'
    );
    const out = stdout.join('\n');
    expect(out).toContain('Secret Access Key: written to .env');
    expect(out).not.toContain('tsec_XxYy');
  });

  it('takes a path for --env and the AWS variable set', async () => {
    mkdirSync(join(cwd, 'config'));
    await run({ env: 'config/.env.local', for: 'aws' });
    expect(readFileSync(join(cwd, 'config/.env.local'), 'utf8')).toContain(
      'AWS_ENDPOINT_URL_S3=https://t3.storage.dev\n'
    );
    expect(stdout.join('\n')).toContain('written to config/.env.local');
  });

  it('carries a custom endpoint into the variables', async () => {
    vi.mocked(resolveEndpoints).mockResolvedValue({
      storage: 'https://s3.example.dev',
      iam: 'https://iam.example.dev',
    });
    await run({ env: true });
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain(
      'TIGRIS_STORAGE_ENDPOINT=https://s3.example.dev\n'
    );
    await run({ export: true, for: 'aws' });
    expect(stdout.at(-1)).toContain(
      "export AWS_ENDPOINT_URL_S3='https://s3.example.dev'\n" +
        "export AWS_ENDPOINT_URL_IAM='https://iam.example.dev'"
    );
  });

  it('resolves the endpoints before creating the key, so a failure there loses nothing', async () => {
    vi.mocked(resolveEndpoints).mockRejectedValue(new Error('profile gone'));
    await expect(run({ env: true })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('profile gone');
    expect(createAccessKey).not.toHaveBeenCalled();
  });

  it('prints the credentials and exits 1 when the dotenv file cannot be written', async () => {
    // A directory in the way: writeFileSync fails with EISDIR.
    mkdirSync(join(cwd, '.env'));
    await run({ env: true });
    // Reported through the exit code, not process.exit(), so a piped stdout
    // is never cut short of the secret.
    expect(process.exitCode).toBe(1);
    expect(process.exit).not.toHaveBeenCalled();
    const out = stdout.join('\n');
    expect(out).toContain('Secret Access Key: tsec_XxYy');
    expect(out).not.toContain('written to');
    const err = stderr.join('\n');
    expect(err).toContain('Could not write .env: EISDIR');
    expect(err).toContain('The credentials were printed instead.');
  });

  it('suggests fixing permissions when the write is denied', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return;
    mkdirSync(join(cwd, 'ro'), { mode: 0o500 });
    await run({ env: 'ro/.env' });
    expect(process.exitCode).toBe(1);
    expect(stderr.join('\n')).toContain(
      "Change the file's permissions or re-run with sudo."
    );
  });

  it('reports a failed write in JSON and still returns the secret', async () => {
    await run({ env: 'missing-dir/.env', json: true });
    expect(process.exitCode).toBe(1);
    const output = JSON.parse(stdout[0]);
    expect(output.secret).toBe('tsec_XxYy');
    expect(output.env).toBeUndefined();
    expect(output.envError).toContain('ENOENT');
    expect(stderr).toEqual([]);
  });

  it('does not mistake an unreadable .gitignore for a failed write', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return;
    writeFileSync(join(cwd, '.gitignore'), '.env\n', { mode: 0o000 });
    await run({ env: true });
    expect(process.exitCode).toBeUndefined();
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain('tsec_XxYy');
    expect(stdout.join('\n')).toContain('written to .env');
    expect(stderr).toEqual([]);
  });

  it('warns when .gitignore would let the file be committed', async () => {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules\n');
    await run({ env: true });
    expect(stderr.join('\n')).toContain('.env is not ignored by .gitignore');
  });

  it('stays quiet about .gitignore when the file is covered or there is none', async () => {
    await run({ env: true });
    writeFileSync(join(cwd, '.gitignore'), '.env\n');
    await run({ env: true });
    expect(stderr.join('\n')).not.toContain('.gitignore');
  });

  it('prints only export lines on stdout with --export', async () => {
    await run({ bucket: 'my-app', role: 'Editor', export: true });
    expect(stdout).toEqual([
      "export TIGRIS_STORAGE_ACCESS_KEY_ID='tid_AaBb'\n" +
        "export TIGRIS_STORAGE_SECRET_ACCESS_KEY='tsec_XxYy'\n" +
        "export TIGRIS_STORAGE_BUCKET='my-app'",
    ]);
  });

  it('refuses --export together with JSON output', async () => {
    await expect(run({ export: true, json: true })).rejects.toThrow(ExitSignal);
    expect(createAccessKey).not.toHaveBeenCalled();
  });

  it('rejects an unknown --for', async () => {
    await expect(run({ for: 'gcp' })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('Invalid --for "gcp"');
  });

  it('reports roles and the written file in JSON, and keeps the secret', async () => {
    await run({ bucket: 'my-app', role: 'Editor', env: true, json: true });
    const output = JSON.parse(stdout[0]);
    expect(output).toMatchObject({
      action: 'created',
      id: 'tid_AaBb',
      secret: 'tsec_XxYy',
      roles: [{ bucket: 'my-app', role: 'Editor' }],
      env: '.env',
    });
    expect(output.nextActions).toBeUndefined();
    // No .gitignore in this cwd, so nothing to report.
    expect(output.gitignored).toBeUndefined();
  });

  it('reports an unignored dotenv file in JSON instead of warning', async () => {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules\n');
    await run({ env: true, json: true });
    expect(JSON.parse(stdout[0]).gitignored).toBe(false);
    expect(stderr).toEqual([]);
  });
});

describe('access-keys create --admin', () => {
  it('grants every bucket and writes no bucket variable', async () => {
    await run({ admin: true, export: true, for: 'aws' });
    expect(createAccessKey).toHaveBeenCalledWith('my-app', {
      config: {},
      bucketsRole: [{ bucket: '*', role: 'NamespaceAdmin' }],
    });
    expect(stdout[0]).toContain("export AWS_ACCESS_KEY_ID='tid_AaBb'");
    // Admin keys are not tied to one bucket, so no bucket variable.
    expect(stdout[0]).not.toContain('BUCKET');
  });
});
