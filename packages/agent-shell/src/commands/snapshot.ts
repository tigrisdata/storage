import { createBucketSnapshot, listBucketSnapshots } from '@tigrisdata/storage';
import { defineCommand, type ExecResult } from 'just-bash';
import type { TigrisConfig } from '../types.js';
import { argError, type FlagSchema, parseFlags, sdkError } from './args.js';

const USAGE = 'snapshot [<bucket>] [--name label] [--list]';
const SCHEMA: FlagSchema = {
  '--name': 'value',
  '--list': 'boolean',
};

export interface SnapshotOptions {
  /** Resolve cwd to a mounted bucket so <bucket> can be omitted. */
  resolveBucket?: (path: string) => { bucket: string; key: string } | null;
}

interface SnapshotInput {
  bucket: string;
  mode: 'list' | 'create';
  name: string | undefined;
}

export function createSnapshotCommand(
  config: TigrisConfig,
  options?: SnapshotOptions
) {
  return defineCommand('snapshot', async (args, ctx) => {
    const input = parseInput(args, ctx.cwd, options);
    if ('stderr' in input) return input;

    if (input.mode === 'list') return listSnapshots(input.bucket, config);

    const result = await createBucketSnapshot(input.bucket, {
      ...(input.name !== undefined && { name: input.name }),
      config,
    });
    if ('error' in result) return sdkError('snapshot', result.error);

    return {
      stdout: `${result.data.snapshotVersion}\n`,
      stderr: '',
      exitCode: 0,
    };
  });
}

function parseInput(
  args: string[],
  cwd: string,
  options: SnapshotOptions | undefined
): SnapshotInput | ExecResult {
  const parsed = parseFlags(args, SCHEMA);
  if ('error' in parsed) return argError('snapshot', parsed.error, USAGE);
  const { flags, positional } = parsed;

  if (positional.length > 1) {
    return argError('snapshot', `unexpected argument: ${positional[1]}`, USAGE);
  }

  const isList = flags['--list'] === true;
  const name =
    typeof flags['--name'] === 'string' ? flags['--name'] : undefined;
  if (isList && name !== undefined) {
    return argError('snapshot', '--name and --list cannot be combined', USAGE);
  }

  const bucket = positional[0] ?? options?.resolveBucket?.(cwd)?.bucket;
  if (!bucket) {
    return argError(
      'snapshot',
      'missing <bucket> (cwd not in a mounted bucket)',
      USAGE
    );
  }

  return { bucket, mode: isList ? 'list' : 'create', name };
}

async function listSnapshots(bucket: string, config: TigrisConfig) {
  const result = await listBucketSnapshots(bucket, { config });
  if ('error' in result) return sdkError('snapshot', result.error);

  const snapshots = result.data.snapshots;
  if (snapshots.length === 0) {
    return { stdout: 'No snapshots.\n', stderr: '', exitCode: 0 };
  }
  const lines = snapshots.map((s) => {
    const label = s.name ? ` (${s.name})` : '';
    const date = s.creationDate?.toISOString() ?? 'unknown';
    return `${s.version}${label}  ${date}`;
  });
  return { stdout: `${lines.join('\n')}\n`, stderr: '', exitCode: 0 };
}
