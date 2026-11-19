import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

// Record every file stream cp opens, to check none are left open.
const streams = vi.hoisted(() => [] as { destroyed: boolean }[]);
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    createReadStream: ((...args: Parameters<typeof fs.createReadStream>) => {
      const stream = fs.createReadStream(...args);
      streams.push(stream);
      return stream;
    }) as typeof fs.createReadStream,
  };
});

vi.mock('@auth/provider.js', () => ({
  getStorageConfig: vi.fn(async () => ({ endpoint: 'https://t3.example' })),
}));
vi.mock('@tigrisdata/storage', () => ({
  put: vi.fn(async (path: string) => ({
    data: { path, size: 1, modified: new Date() },
  })),
}));

import { put } from '@tigrisdata/storage';
import {
  addArgumentsToCommand,
  extractArgumentValues,
} from '../../src/cli-core.js';
import cp from '../../src/lib/cp.js';
import putObject from '../../src/lib/objects/put.js';
import type { Argument, Specs } from '../../src/types.js';
import { getCommandSpec, setSpecs } from '../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

class ExitSignal extends Error {}

let stdout: string[];
let stderr: string[];
let dir: string;

beforeEach(() => {
  vi.clearAllMocks();
  streams.length = 0;
  stdout = [];
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.join(' '));
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitSignal();
  });

  dir = mkdtempSync(join(tmpdir(), 'tigris-no-overwrite-'));
  mkdirSync(join(dir, 'site'));
  writeFileSync(join(dir, 'site', 'new.txt'), 'new');
  writeFileSync(join(dir, 'site', 'old.txt'), 'old');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Parse argv through Commander with the spec's arguments, as the CLI does,
// so `--no-overwrite` arrives in the shape users produce.
const run = async (
  [command, operation]: [string, string?],
  handler: (options: Record<string, unknown>) => Promise<void>,
  argv: string[],
  // Global arguments such as --format are registered by the CLI entry point,
  // not the command spec, so tests pass them directly.
  globals: Record<string, unknown> = {}
) => {
  const args = getCommandSpec(command, operation)?.arguments as Argument[];
  const cmd = new Command().exitOverride();
  addArgumentsToCommand(cmd, args);
  cmd.parse(argv, { from: 'user' });
  await handler({
    ...extractArgumentValues(args, cmd.args, cmd.opts()),
    ...globals,
  }).catch((err) => {
    if (!(err instanceof ExitSignal)) throw err;
  });
};

// Pretend `old.txt` already exists in the bucket.
const rejectExisting = () =>
  vi
    .mocked(put)
    .mockImplementation(async (path: string) =>
      path.endsWith('old.txt')
        ? { error: new Error('File already exists') }
        : { data: { path, size: 1, modified: new Date() } as never }
    );

const putOptions = () =>
  vi.mocked(put).mock.calls.map(([, , options]) => options?.allowOverwrite);

describe('objects put --no-overwrite', () => {
  const putCmd = (argv: string[]) =>
    run(['objects', 'put'], putObject, ['my-bucket', 'old.txt', ...argv]);

  it('passes allowOverwrite: false', async () => {
    await putCmd([join(dir, 'site', 'new.txt'), '--no-overwrite']);
    expect(putOptions()).toEqual([false]);
  });

  it('leaves allowOverwrite unset without the flag', async () => {
    await putCmd([join(dir, 'site', 'new.txt')]);
    expect(putOptions()).toEqual([undefined]);
  });

  it('fails with a clear message when the key exists', async () => {
    rejectExisting();
    await putCmd([join(dir, 'site', 'old.txt'), '--no-overwrite']);

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr.join('\n')).toContain(
      't3://my-bucket/old.txt already exists (--no-overwrite)'
    );
  });
});

describe('cp --no-overwrite', () => {
  const cpCmd = (argv: string[], globals?: Record<string, unknown>) =>
    run(['cp'], cp, argv, globals);

  it('passes allowOverwrite: false for a single file', async () => {
    await cpCmd([
      join(dir, 'site', 'new.txt'),
      't3://my-bucket',
      '--no-overwrite',
    ]);
    expect(putOptions()).toEqual([false]);
  });

  it('fails a single file whose key exists', async () => {
    rejectExisting();
    await cpCmd([
      join(dir, 'site', 'old.txt'),
      't3://my-bucket',
      '--no-overwrite',
    ]);

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr.join('\n')).toContain(
      't3://my-bucket/old.txt already exists (--no-overwrite)'
    );
  });

  it('skips existing keys in a recursive copy', async () => {
    rejectExisting();
    await cpCmd([
      `${join(dir, 'site')}/`,
      't3://my-bucket/',
      '-r',
      '--no-overwrite',
    ]);

    expect(putOptions()).toEqual([false, false]);
    expect(process.exit).not.toHaveBeenCalledWith(1);
    expect(stderr).toEqual([]);
    const out = stdout.join('\n');
    expect(out).toMatch(
      /Skipped .*old\.txt \(t3:\/\/my-bucket\/old\.txt exists\)/
    );
    expect(out).toContain('Uploaded 1 file(s), skipped 1 existing');
  });

  it('reports skipped files in JSON output', async () => {
    rejectExisting();
    await cpCmd(
      [join(dir, 'site', '*.txt'), 't3://my-bucket/', '--no-overwrite'],
      { format: 'json' }
    );

    expect(JSON.parse(stdout.at(-1) as string)).toEqual({
      action: 'copied',
      direction: 'local-to-remote',
      count: 1,
      skipped: 1,
    });
  });

  it('closes the files of skipped uploads', async () => {
    rejectExisting();
    await cpCmd([
      `${join(dir, 'site')}/`,
      't3://my-bucket/',
      '-r',
      '--no-overwrite',
    ]);

    expect(streams).toHaveLength(2);
    expect(streams.every((stream) => stream.destroyed)).toBe(true);
  });

  it('reports skipped: 0 in JSON output when nothing matches', async () => {
    mkdirSync(join(dir, 'empty'));
    await cpCmd(
      [`${join(dir, 'empty')}/`, 't3://my-bucket/', '-r', '--no-overwrite'],
      { format: 'json' }
    );
    await cpCmd(
      [join(dir, 'site', '*.png'), 't3://my-bucket/', '--no-overwrite'],
      { format: 'json' }
    );

    expect(stdout.map((line) => JSON.parse(line))).toEqual([
      { action: 'copied', direction: 'local-to-remote', count: 0, skipped: 0 },
      { action: 'copied', direction: 'local-to-remote', count: 0, skipped: 0 },
    ]);
  });

  it('still counts other errors as failures', async () => {
    vi.mocked(put).mockResolvedValue({ error: new Error('Access denied') });
    await cpCmd([
      `${join(dir, 'site')}/`,
      't3://my-bucket/',
      '-r',
      '--no-overwrite',
    ]);

    expect(stderr.join('\n')).toContain('Access denied');
    expect(stdout.join('\n')).toContain('Uploaded 0 file(s)');
  });

  it('rejects --no-overwrite for downloads', async () => {
    await cpCmd([
      't3://my-bucket/old.txt',
      join(dir, 'out.txt'),
      '--no-overwrite',
    ]);

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr.join('\n')).toContain(
      '--no-overwrite only applies to local-to-remote uploads'
    );
    expect(put).not.toHaveBeenCalled();
  });
});
