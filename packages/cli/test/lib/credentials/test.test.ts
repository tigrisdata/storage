import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/provider.js', () => ({ getStorageConfigWithOrg: vi.fn() }));
vi.mock('@tigrisdata/storage', () => ({ list: vi.fn(), listBuckets: vi.fn() }));

import { getStorageConfigWithOrg } from '@auth/provider.js';
import { list } from '@tigrisdata/storage';
import test from '../../../src/lib/credentials/test.js';
import type { Specs } from '../../../src/types.js';
import { setSpecs } from '../../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

class ExitSignal extends Error {}

const TEMPORARY = {
  accessKeyId: 'tsid_a',
  secretAccessKey: 'tssec_a',
  sessionToken: 'tsts1',
};

let stdout: string[];

beforeEach(() => {
  vi.clearAllMocks();
  stdout = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitSignal();
  });
  vi.mocked(getStorageConfigWithOrg).mockResolvedValue(TEMPORARY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const denied = () =>
  vi.mocked(list).mockResolvedValue({
    error: new Error('Unable to list objects Access Denied.'),
  });

describe('credentials test with temporary credentials', () => {
  it('passes when the policy only denies listing, as for write-only ones', async () => {
    denied();

    await test({ bucket: 'my-bucket' });

    expect(stdout.join('\n')).toContain(
      "Credentials are valid. Their policy doesn't allow listing this bucket"
    );
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('says so in JSON', async () => {
    denied();

    await test({ bucket: 'my-bucket', format: 'json' });

    expect(JSON.parse(stdout[stdout.length - 1])).toEqual({
      valid: true,
      bucket: 'my-bucket',
      canList: false,
    });
  });

  it('fails on credentials the gateway does not accept', async () => {
    vi.mocked(list).mockResolvedValue({
      error: new Error(
        'Unable to list objects The AWS Access Key Id you provided does not exist in our records.'
      ),
    });

    await expect(test({ bucket: 'my-bucket' })).rejects.toBeInstanceOf(
      ExitSignal
    );
  });

  it('still fails a denial for an access key', async () => {
    vi.mocked(getStorageConfigWithOrg).mockResolvedValue({
      accessKeyId: 'tid_a',
      secretAccessKey: 'tsec_a',
    });
    denied();

    await expect(test({ bucket: 'my-bucket' })).rejects.toBeInstanceOf(
      ExitSignal
    );
  });
});
