import { getStorageConfig } from '@auth/provider.js';
import { bundle } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { getFormat, getOption, readStdin } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';
import { createWriteStream, existsSync, readFileSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const MAX_KEYS = 5000;

function parseKeys(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function detectCompression(
  outputPath: string
): 'none' | 'gzip' | 'zstd' | undefined {
  if (outputPath.endsWith('.tar.gz') || outputPath.endsWith('.tgz')) {
    return 'gzip';
  }
  if (outputPath.endsWith('.tar.zst')) {
    return 'zstd';
  }
  if (outputPath.endsWith('.tar')) {
    return 'none';
  }
  return undefined;
}

export default async function bundleCommand(options: Record<string, unknown>) {
  const bucketArg = getOption<string>(options, ['bucket']);
  const keysArg = getOption<string>(options, ['keys', 'k']);
  const outputPath = getOption<string>(options, ['output', 'o']);
  const compressionArg = getOption<string>(options, ['compression']);
  const onError = getOption<string>(options, ['on-error', 'onError'], 'skip');
  const format = getFormat(options);
  const jsonMode = format === 'json';

  // stdout carries binary data when no --output
  const stdoutBinary = !outputPath;

  if (!bucketArg) {
    exitWithError('Bucket is required');
  }

  const { bucket, path: prefix } = parseAnyPath(bucketArg);

  if (!bucket) {
    exitWithError('Invalid bucket');
  }

  // Resolve keys: file, inline, or stdin
  let keys: string[];

  if (keysArg) {
    if (keysArg.includes(',')) {
      // Commas present → always treat as inline comma-separated keys
      keys = keysArg
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    } else if (existsSync(keysArg)) {
      // No commas and local file exists → read as keys file
      keys = parseKeys(readFileSync(keysArg, 'utf-8'));
    } else {
      // Single key
      keys = [keysArg.trim()];
    }
  } else if (!process.stdin.isTTY) {
    const input = await readStdin();
    keys = parseKeys(input);
  } else {
    exitWithError('Keys are required. Provide via --keys or pipe to stdin.');
  }

  // Prepend path prefix from bucket arg (e.g. t3://bucket/prefix)
  if (prefix) {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    keys = keys.map((key) => `${normalizedPrefix}${key}`);
  }

  if (keys.length === 0) {
    exitWithError('No keys found');
  }

  if (keys.length > MAX_KEYS) {
    exitWithError(`Too many keys (max ${MAX_KEYS}). Got ${keys.length}`);
  }

  // Resolve compression: explicit flag > auto-detect from extension > default
  let compression: 'none' | 'gzip' | 'zstd' = 'none';
  if (compressionArg) {
    compression = compressionArg as 'none' | 'gzip' | 'zstd';
  } else if (outputPath) {
    compression = detectCompression(outputPath) ?? 'none';
  }

  if (!stdoutBinary && !jsonMode) {
    process.stderr.write(`Bundling ${keys.length} object(s)...\n`);
  }

  const config = await getStorageConfig({ withCredentialProvider: true });

  const { data, error } = await bundle(keys, {
    config: { ...config, bucket },
    compression,
    onError: onError as 'skip' | 'fail',
  });

  if (error) {
    exitWithError(error);
  }

  const nodeStream = Readable.fromWeb(data.body as ReadableStream);

  if (outputPath) {
    const writeStream = createWriteStream(outputPath);
    await pipeline(nodeStream, writeStream);

    if (jsonMode) {
      console.log(
        JSON.stringify({
          action: 'bundled',
          bucket,
          keys: keys.length,
          compression,
          output: outputPath,
        })
      );
    } else {
      console.log(
        `Bundled ${keys.length} object(s) from '${bucket}' to ${outputPath}`
      );
    }
  } else {
    await pipeline(nodeStream, process.stdout);

    if (jsonMode) {
      console.error(
        JSON.stringify({
          action: 'bundled',
          bucket,
          keys: keys.length,
          compression,
          output: 'stdout',
        })
      );
    }
  }

  process.exit(0);
}
