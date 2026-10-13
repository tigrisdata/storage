import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/iam.js', () => ({
  getIAMConfig: vi.fn(async () => ({})),
}));
vi.mock('@tigrisdata/iam', () => ({
  setAccessKeyScope: vi.fn(async () => ({ data: undefined })),
}));

import { setAccessKeyScope } from '@tigrisdata/iam';
import set from '../../../src/lib/access-keys/set.js';
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

describe('access-keys set', () => {
  it('disables the default permissions and reports the scope in JSON', async () => {
    await set({ id: 'tid_a', defaultPermissions: 'disable', json: true });

    expect(setAccessKeyScope).toHaveBeenCalledWith(
      'tid_a',
      'no_default_allow',
      { config: {} }
    );
    expect(JSON.parse(stdout[0])).toEqual({
      action: 'updated',
      id: 'tid_a',
      scope: 'no_default_allow',
    });
  });

  it('enables them again', async () => {
    await set({ id: 'tid_a', 'default-permissions': 'enable' });
    expect(setAccessKeyScope).toHaveBeenCalledWith('tid_a', 'standard', {
      config: {},
    });
  });

  it('rejects an unknown value before touching the key', async () => {
    await expect(
      set({ id: 'tid_a', defaultPermissions: 'off' })
    ).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain(
      'Invalid --default-permissions "off". Valid values are: enable, disable'
    );
    expect(setAccessKeyScope).not.toHaveBeenCalled();
  });

  it('needs a setting to change', async () => {
    await expect(set({ id: 'tid_a' })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain(
      'Nothing to change: pass --default-permissions enable or disable'
    );
    expect(setAccessKeyScope).not.toHaveBeenCalled();
  });

  it('requires the id', async () => {
    await expect(set({ defaultPermissions: 'enable' })).rejects.toThrow(
      ExitSignal
    );
    expect(stderr.join('\n')).toContain('Access key ID is required');
  });

  it('fails with the gateway error', async () => {
    vi.mocked(setAccessKeyScope).mockResolvedValueOnce({
      error: new Error('key not found'),
    });
    await expect(
      set({ id: 'tid_a', defaultPermissions: 'disable' })
    ).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('key not found');
  });
});
