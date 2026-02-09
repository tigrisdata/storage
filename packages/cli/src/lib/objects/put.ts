import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
import { getOption } from '../../utils/options.js';
import { formatOutput, formatSize } from '../../utils/format.js';
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

  // Check for stdin or file input
  const hasStdin = !process.stdin.isTTY;

  if (!file && !hasStdin) {
    printFailure(context, 'File path is required (or pipe data via stdin)');
    process.exit(1);
  }

  let body: ReadableStream;
  let fileSize: number | undefined;

  if (file) {
    // Read from file
    try {
      const stats = statSync(file);
      fileSize = stats.size;
    } catch {
      printFailure(context, `File not found: ${file}`);
      process.exit(1);
    }
    const fileStream = createReadStream(file);
    body = Readable.toWeb(fileStream) as ReadableStream;
  } else {
    // Read from stdin
    body = Readable.toWeb(process.stdin) as ReadableStream;
  }

  const config = await getStorageConfig();

  // Use multipart upload for files larger than 100MB (or always for stdin)
  const useMultipart =
    !file || (fileSize !== undefined && fileSize > 100 * 1024 * 1024);

  const { data, error } = await put(key, body, {
    access: access === 'public' ? 'public' : 'private',
    contentType,
    multipart: useMultipart,
    onUploadProgress: ({ loaded, percentage }) => {
      if (fileSize !== undefined && fileSize > 0) {
        process.stdout.write(
          `\rUploading: ${formatSize(loaded)} / ${formatSize(fileSize)} (${percentage}%)`
        );
      } else {
        process.stdout.write(`\rUploading: ${formatSize(loaded)}`);
      }
    },
    config: {
      ...config,
      bucket,
    },
  });

  // Clear the progress line
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  const result = [
    {
      path: data.path,
      size: formatSize(data.size ?? fileSize ?? 0),
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
