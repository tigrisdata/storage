import { createWriteStream, writeFileSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extname } from 'path';
import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { get } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('objects', 'get');

// Text file extensions that should use string format
const TEXT_EXTENSIONS = new Set([
  // Code
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.php',
  '.java',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.kt',
  '.scala',
  '.clj',
  '.ex',
  '.exs',
  '.erl',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.bat',
  '.cmd',
  '.sql',
  '.graphql',
  '.gql',
  // Config
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.xml',
  '.plist',
  '.env',
  '.properties',
  // Markup & styles
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.md',
  '.markdown',
  '.mdx',
  '.rst',
  '.txt',
  '.text',
  '.csv',
  '.tsv',
  '.log',
  // Templates
  '.ejs',
  '.hbs',
  '.pug',
  '.jade',
  '.njk',
  '.twig',
  '.liquid',
  // Other text
  '.svg',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
]);

/**
 * Detect format based on file extension
 * Text files use 'string', everything else uses 'stream'
 */
function detectFormat(key: string, output?: string): 'string' | 'stream' {
  const pathToCheck = output || key;
  const ext = extname(pathToCheck).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) ? 'string' : 'stream';
}

export default async function getObject(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket']);
  const key = getOption<string>(options, ['key']);
  const output = getOption<string>(options, ['output', 'o', 'O']);
  const modeOption = getOption<string>(options, ['mode', 'm', 'M']);

  if (!bucket) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  if (!key) {
    printFailure(context, 'Object key is required');
    process.exit(1);
  }

  const config = await getStorageConfig();

  // Use provided mode or auto-detect from extension
  const mode = (modeOption as 'string' | 'stream') || detectFormat(key, output);

  if (mode === 'stream') {
    const { data, error } = await get(key, 'stream', {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      printFailure(context, error.message);
      process.exit(1);
    }

    if (output) {
      const writeStream = createWriteStream(output);
      await pipeline(Readable.fromWeb(data as ReadableStream), writeStream);
      printSuccess(context, { key, output });
    } else {
      // Stream to stdout for binary data
      await pipeline(Readable.fromWeb(data as ReadableStream), process.stdout);
      printSuccess(context);
    }
  } else {
    const { data, error } = await get(key, 'string', {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      printFailure(context, error.message);
      process.exit(1);
    }

    if (output) {
      writeFileSync(output, data);
      printSuccess(context, { key, output });
    } else {
      console.log(data);
      printSuccess(context);
    }
  }
}
