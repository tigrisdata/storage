import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/provider.js', () => ({
  getStorageConfig: vi.fn(async () => ({ endpoint: 'https://t3.example' })),
}));
vi.mock('@tigrisdata/storage', () => ({
  purgeBucket: vi.fn(async (bucket: string) => ({
    data: { bucket, purged: true },
  })),
}));
vi.mock('@utils/interactive.js', () => ({
  confirm: vi.fn(async () => true),
  requireInteractive: vi.fn(),
}));

import { purgeBucket } from '@tigrisdata/storage';
import { confirm, requireInteractive } from '@utils/interactive.js';
import purge from '../../../src/lib/buckets/purge.js';
import type { Specs } from '../../../src/types.js';
import { setSpecs } from '../../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

class ExitSignal extends Error {}

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  // Clears calls, not implementations: per-test overrides below use `…Once`.
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buckets purge', () => {
  it('purges one bucket after a confirmation that says it is final', async () => {
    await purge({ name: 'old-bucket' });

    expect(requireInteractive).toHaveBeenCalledWith(
      'Use --yes to skip confirmation'
    );
    expect(confirm).toHaveBeenCalledWith(
      "Permanently destroy soft-deleted bucket 'old-bucket'? It can no longer be restored."
    );
    expect(purgeBucket).toHaveBeenCalledWith('old-bucket', {
      config: { endpoint: 'https://t3.example' },
    });
  });

  it('purges every bucket in a comma-separated list, in order', async () => {
    // The spec marks `name` as multiple, so the CLI hands the handler an array.
    await purge({ name: ['a', 'b', 'c'], yes: true, json: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(vi.mocked(purgeBucket).mock.calls.map(([name]) => name)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(JSON.parse(stdout[0])).toMatchObject({
      action: 'purged',
      names: ['a', 'b', 'c'],
      errors: [],
    });
  });

  it('names every bucket in the confirmation when several are given', async () => {
    await purge({ name: ['a', 'b'] });
    expect(confirm).toHaveBeenCalledWith(
      'Permanently destroy 2 soft-deleted buckets: a, b? They can no longer be restored.'
    );
  });

  it('keeps going after a failure, reports it, and exits non-zero', async () => {
    vi.mocked(purgeBucket)
      .mockResolvedValueOnce({ data: { bucket: 'a', purged: true } })
      .mockResolvedValueOnce({
        error: new Error('bucket is not in soft-delete state'),
      })
      .mockResolvedValueOnce({ data: { bucket: 'c', purged: true } });

    await expect(
      purge({ name: ['a', 'b', 'c'], yes: true, json: true })
    ).rejects.toThrow(ExitSignal);

    expect(purgeBucket).toHaveBeenCalledTimes(3);
    expect(JSON.parse(stdout[0])).toMatchObject({
      names: ['a', 'c'],
      errors: [{ name: 'b', error: 'bucket is not in soft-delete state' }],
    });
    expect(stderr.join('\n')).toContain('bucket is not in soft-delete state');
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await purge({ name: 'old-bucket' });
    expect(purgeBucket).not.toHaveBeenCalled();
    expect(stdout).toContain('Aborted');
  });

  it('requires a name', async () => {
    await expect(purge({ yes: true })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('Bucket name is required');
    expect(purgeBucket).not.toHaveBeenCalled();
  });
});
