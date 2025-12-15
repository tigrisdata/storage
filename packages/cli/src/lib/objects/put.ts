import { readFileSync, statSync } from 'fs';
import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { put } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('objects', 'put');

export default async function putObject(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket']);
  const key = getOption<string>(options, ['key']);
  const file = getOption<string>(options, ['file']);
  const access = getOption<string>(options, ['access', 'a', 'A'], 'private');
  const contentType = getOption<string>(options, [
    'content-type',
    'contentType',
    't',
    'T',
  ]);
  const format = getOption<string>(options, ['format', 'f', 'F'], 'table');

  if (!bucket) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  if (!key) {
    printFailure(context, 'Object key is required');
    process.exit(1);
  }

  if (!file) {
    printFailure(context, 'File path is required');
    process.exit(1);
  }

  // Check if file exists
  try {
    statSync(file);
  } catch {
    printFailure(context, `File not found: ${file}`);
    process.exit(1);
  }

  const config = await getStorageConfig();
  const body = readFileSync(file);

  const { data, error } = await put(key, body, {
    access: access === 'public' ? 'public' : 'private',
    contentType,
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  const result = [
    {
      path: data.path,
      size: formatSize(data.size),
      contentType: data.contentType || '-',
      modified: data.modified,
    },
  ];

  const output = formatOutput(result, format!, 'objects', 'object', [
    { key: 'path', header: 'Path' },
    { key: 'size', header: 'Size' },
    { key: 'contentType', header: 'Content-Type' },
    { key: 'modified', header: 'Modified' },
  ]);

  console.log(output);
  printSuccess(context, { key, bucket });
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
