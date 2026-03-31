import { getStorageConfig } from '@auth/provider.js';
import { put } from '@tigrisdata/storage';
import { failWithError, printNextActions } from '@utils/exit.js';
import { formatOutput, formatSize } from '@utils/format.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';
import { calculateUploadParams } from '@utils/upload.js';
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';

const context = msg('objects', 'put');

export default async function putObject(options: Record<string, unknown>) {
  printStart(context);

  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const fileArg = getOption<string>(options, ['file']);
  const access = getOption<string>(options, ['access', 'a', 'A'], 'private');
  const contentType = getOption<string>(options, [
    'content-type',
    'contentType',
    't',
    'T',
  ]);
  const format = getFormat(options);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  const combined = resolveObjectArgs(bucketArg);
  const bucket = combined.bucket;
  const key = combined.key || keyArg;
  const file = combined.key ? keyArg || fileArg : fileArg;

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  // Check for stdin or file input
  const hasStdin = !process.stdin.isTTY;

  if (!file && !hasStdin) {
    failWithError(context, 'File path is required (or pipe data via stdin)');
  }

  let body: ReadableStream;
  let fileSize: number | undefined;

  if (file) {
    // Read from file
    try {
      const stats = statSync(file);
      fileSize = stats.size;
    } catch {
      failWithError(context, `File not found: ${file}`);
    }
    const fileStream = createReadStream(file);
    body = Readable.toWeb(fileStream) as ReadableStream;
  } else {
    // Read from stdin
    body = Readable.toWeb(process.stdin) as ReadableStream;
  }

  const config = await getStorageConfig({ withCredentialProvider: true });

  // For stdin (no file), always use multipart since we don't know the size
  const uploadParams = file
    ? calculateUploadParams(fileSize)
    : { multipart: true, partSize: 5 * 1024 * 1024, queueSize: 8 };

  const { data, error } = await put(key, body, {
    access: access === 'public' ? 'public' : 'private',
    contentType,
    ...uploadParams,
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
    failWithError(context, error);
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
  printNextActions(context, { key, bucket });
}
