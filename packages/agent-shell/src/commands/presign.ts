import { getPresignedUrl } from '@tigrisdata/storage';
import { defineCommand, type ExecResult } from 'just-bash';
import type { TigrisConfig } from '../types.js';
import { argError, type FlagSchema, parseFlags, sdkError } from './args.js';

const USAGE = 'presign <path> [--expires N] [--put] [--key accessKeyId]';
const SCHEMA: FlagSchema = {
  '--expires': 'value',
  '--put': 'boolean',
  '--key': 'value',
};
const DEFAULT_EXPIRES = 3600;

export interface PresignOptions {
  /** Resolve an absolute path to bucket + key from the mount table. */
  resolveBucket?: (path: string) => { bucket: string; key: string } | null;
}

interface PresignInput {
  path: string;
  expiresIn: number;
  operation: 'get' | 'put';
  accessKeyOverride: string | undefined;
}

export function createPresignCommand(
  config: TigrisConfig,
  options?: PresignOptions
) {
  return defineCommand('presign', async (args, ctx) => {
    const input = parseInput(args);
    if ('stderr' in input) return input;

    const accessKeyId = input.accessKeyOverride ?? config.accessKeyId;
    if (!accessKeyId) {
      return argError(
        'presign',
        "--key is required when logged in via 'login'",
        USAGE
      );
    }

    const resolved = resolveTarget(input.path, ctx.cwd, config, options);
    if (!resolved) {
      return argError(
        'presign',
        'cannot determine bucket. cd into a mounted bucket first.'
      );
    }

    const result = await getPresignedUrl(resolved.key, {
      operation: input.operation,
      expiresIn: input.expiresIn,
      accessKeyId,
      config: { ...config, bucket: resolved.bucket },
    });
    if ('error' in result) return sdkError('presign', result.error);

    return { stdout: `${result.data.url}\n`, stderr: '', exitCode: 0 };
  });
}

function parseInput(args: string[]): PresignInput | ExecResult {
  const parsed = parseFlags(args, SCHEMA);
  if ('error' in parsed) return argError('presign', parsed.error, USAGE);
  const { flags, positional } = parsed;

  if (positional.length === 0)
    return argError('presign', 'missing <path>', USAGE);
  if (positional.length > 1) {
    return argError('presign', `unexpected argument: ${positional[1]}`, USAGE);
  }

  const expires = parseExpires(flags['--expires']);
  if (typeof expires !== 'number') return expires;

  return {
    path: positional[0] ?? '',
    expiresIn: expires,
    operation: flags['--put'] === true ? 'put' : 'get',
    accessKeyOverride:
      typeof flags['--key'] === 'string' ? flags['--key'] : undefined,
  };
}

function parseExpires(raw: string | true | undefined): number | ExecResult {
  if (typeof raw !== 'string') return DEFAULT_EXPIRES;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return argError(
      'presign',
      `--expires must be a positive integer (got '${raw}')`,
      USAGE
    );
  }
  return value;
}

function resolveTarget(
  rawPath: string,
  cwd: string,
  config: TigrisConfig,
  options: PresignOptions | undefined
): { bucket: string; key: string } | null {
  if (config.bucket) {
    const key = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
    return { bucket: config.bucket, key };
  }
  const absolutePath = rawPath.startsWith('/')
    ? rawPath
    : `${cwd.replace(/\/$/, '')}/${rawPath}`;
  return options?.resolveBucket?.(absolutePath) ?? null;
}
