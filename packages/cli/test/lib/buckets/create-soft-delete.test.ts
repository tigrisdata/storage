import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/provider.js', () => ({
  getStorageConfig: vi.fn(async () => ({ endpoint: 'https://t3.example' })),
}));
vi.mock('@tigrisdata/storage', () => ({
  createBucket: vi.fn(async () => ({ data: {} })),
}));

import { createBucket } from '@tigrisdata/storage';
import create from '../../../src/lib/buckets/create.js';
import type { Specs } from '../../../src/types.js';
import { setSpecs } from '../../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

class ExitSignal extends Error {}

let stderr: string[];

beforeEach(() => {
  vi.clearAllMocks();
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
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

// failWithError ends in process.exit, so swallow the exit here and let each
// test assert on the exit code instead.
const run = (opts: Record<string, unknown>) =>
  create({ name: 'my-bucket', ...opts }).catch((err) => {
    if (!(err instanceof ExitSignal)) throw err;
  });

describe('buckets create soft delete', () => {
  it('passes soft delete with the retention days to createBucket', async () => {
    await run({ 'soft-delete': true, 'retention-days': '30' });

    expect(createBucket).toHaveBeenCalledWith(
      'my-bucket',
      expect.objectContaining({
        softDelete: { enabled: true, retentionDays: 30 },
      })
    );
  });

  it('leaves soft delete unset when the flag is not given', async () => {
    await run({});

    expect(vi.mocked(createBucket).mock.calls[0][1]?.softDelete).toBe(
      undefined
    );
  });

  it.each([
    [
      { 'soft-delete': true },
      '--retention-days is required with --soft-delete',
    ],
    [
      { 'retention-days': '30' },
      '--retention-days can only be used with --soft-delete',
    ],
    ...['6', '91', '7.5', 'abc'].map((days) => [
      { 'soft-delete': true, 'retention-days': days },
      '--retention-days must be a whole number between 7 and 90',
    ]),
  ] as [Record<string, unknown>, string][])(
    'rejects %o without creating a bucket',
    async (opts, message) => {
      await run(opts);
      expect(process.exit).toHaveBeenCalledOnce();
      expect(process.exit).not.toHaveBeenCalledWith(0);
      expect(stderr.join('\n')).toContain(message);
      expect(createBucket).not.toHaveBeenCalled();
    }
  );
});
