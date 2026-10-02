import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/iam.js', () => ({
  getIAMConfig: vi.fn(async () => ({ sessionToken: 'tok' })),
}));
vi.mock('@tigrisdata/iam', () => ({
  removeAccessKey: vi.fn(async () => ({})),
}));
vi.mock('@utils/interactive.js', () => ({
  confirm: vi.fn(async () => true),
  requireInteractive: vi.fn(),
}));

import { removeAccessKey } from '@tigrisdata/iam';
import { confirm } from '@utils/interactive.js';
import remove from '../../../src/lib/access-keys/delete.js';
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

describe('access-keys delete', () => {
  it('deletes one key after confirmation', async () => {
    await remove({ id: 'tid_a' });
    expect(confirm).toHaveBeenCalledWith("Delete access key 'tid_a'?");
    expect(removeAccessKey).toHaveBeenCalledWith('tid_a', {
      config: { sessionToken: 'tok' },
    });
  });

  it('deletes every key in a comma-separated list, in order', async () => {
    // The spec marks `id` as multiple, so the CLI hands the handler an array.
    await remove({ id: ['tid_a', 'tid_b', 'tid_c'], yes: true, json: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(vi.mocked(removeAccessKey).mock.calls.map(([id]) => id)).toEqual([
      'tid_a',
      'tid_b',
      'tid_c',
    ]);
    expect(JSON.parse(stdout[0])).toMatchObject({
      action: 'deleted',
      ids: ['tid_a', 'tid_b', 'tid_c'],
      errors: [],
    });
  });

  it('names every key in the confirmation when several are given', async () => {
    await remove({ id: ['tid_a', 'tid_b'] });
    expect(confirm).toHaveBeenCalledWith('Delete 2 access keys: tid_a, tid_b?');
  });

  it('keeps going after a failure, reports it, and exits non-zero', async () => {
    vi.mocked(removeAccessKey)
      .mockResolvedValueOnce({ data: undefined })
      .mockResolvedValueOnce({ error: new Error('key not found') })
      .mockResolvedValueOnce({ data: undefined });

    await expect(
      remove({ id: ['tid_a', 'tid_b', 'tid_c'], yes: true, json: true })
    ).rejects.toThrow(ExitSignal);

    expect(removeAccessKey).toHaveBeenCalledTimes(3);
    expect(JSON.parse(stdout[0])).toMatchObject({
      ids: ['tid_a', 'tid_c'],
      errors: [{ id: 'tid_b', error: 'key not found' }],
    });
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await remove({ id: ['tid_a', 'tid_b'] });
    expect(removeAccessKey).not.toHaveBeenCalled();
    expect(stdout).toContain('Aborted');
  });

  it('requires an id', async () => {
    await expect(remove({ yes: true })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('Access key ID is required');
    expect(removeAccessKey).not.toHaveBeenCalled();
  });
});
