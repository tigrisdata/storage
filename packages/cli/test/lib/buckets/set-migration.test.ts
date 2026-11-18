import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/provider.js', () => ({
  getStorageConfigWithOrg: vi.fn(async () => ({
    endpoint: 'https://t3.example',
  })),
}));
vi.mock('@tigrisdata/storage', () => ({
  setBucketMigration: vi.fn(async () => ({
    data: { bucket: 'my-bucket', updated: true },
  })),
}));

import { setBucketMigration } from '@tigrisdata/storage';
import {
  addArgumentsToCommand,
  extractArgumentValues,
} from '../../../src/cli-core.js';
import setMigration from '../../../src/lib/buckets/set-migration.js';
import type { Argument, Specs } from '../../../src/types.js';
import { getCommandSpec, setSpecs } from '../../../src/utils/specs.js';

const specs = YAML.parse(
  readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'),
  { schema: 'core' }
) as Specs;
setSpecs(specs);

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

const source = [
  'my-bucket',
  '--bucket',
  'source-bucket',
  '--endpoint',
  'https://s3.amazonaws.com',
  '--region',
  'us-east-1',
  '--access-key',
  'AKIA',
  '--secret-key',
  'secret',
];

// Parse real argv through Commander with the spec's arguments, the way the
// CLI does, so the option keys and comma split match what users get.
const run = async (argv: string[]) => {
  const args = getCommandSpec('buckets', 'set-migration')
    ?.arguments as Argument[];
  const cmd = new Command().exitOverride();
  addArgumentsToCommand(cmd, args);
  cmd.parse(argv, { from: 'user' });

  await setMigration(extractArgumentValues(args, cmd.args, cmd.opts())).catch(
    (err) => {
      if (!(err instanceof ExitSignal)) throw err;
    }
  );
};

describe('buckets set-migration --skip-patterns', () => {
  it('sends comma-separated skip patterns with the source config', async () => {
    await run([...source, '--skip-patterns', 'tmp/*, *.tmp,manifest.json']);

    expect(setBucketMigration).toHaveBeenCalledWith('my-bucket', {
      dataMigration: {
        enabled: true,
        accessKey: 'AKIA',
        secretKey: 'secret',
        region: 'us-east-1',
        name: 'source-bucket',
        endpoint: 'https://s3.amazonaws.com',
        writeThrough: false,
        skipPatterns: ['tmp/*', '*.tmp', 'manifest.json'],
      },
      config: { endpoint: 'https://t3.example' },
    });
  });

  it('leaves skip patterns unset when the flag is not given', async () => {
    await run(source);

    expect(
      vi.mocked(setBucketMigration).mock.calls[0][1]?.dataMigration
        ?.skipPatterns
    ).toBeUndefined();
  });

  it('rejects --skip-patterns with --disable', async () => {
    await run(['my-bucket', '--disable', '--skip-patterns', 'tmp/*']);

    expect(process.exit).toHaveBeenCalledOnce();
    expect(stderr.join('\n')).toContain(
      'Cannot use --disable with other migration options'
    );
    expect(setBucketMigration).not.toHaveBeenCalled();
  });

  it('rejects --skip-patterns without a value', async () => {
    await run([...source, '--skip-patterns']);

    expect(process.exit).toHaveBeenCalledOnce();
    expect(stderr.join('\n')).toContain('--skip-patterns requires a value');
    expect(setBucketMigration).not.toHaveBeenCalled();
  });

  it('surfaces SDK validation errors', async () => {
    vi.mocked(setBucketMigration).mockResolvedValueOnce({
      error: new Error('Skip pattern "*" would match every object'),
    });

    await run([...source, '--skip-patterns', '*']);

    expect(process.exit).toHaveBeenCalledOnce();
    expect(stderr.join('\n')).toContain('would match every object');
  });
});
