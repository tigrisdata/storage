import { getStorageConfig } from '@auth/provider.js';
import { getRestoreInfo } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'restore-info');

export default async function restoreInfo(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const versionId = getOption<string>(options, ['version-id', 'versionId']);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  const { bucket, key } = resolveObjectArgs(bucketArg, keyArg);

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await getRestoreInfo(key, {
    ...(versionId ? { versionId } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    failWithError(context, error);
  }

  // undefined means there is nothing to restore — a non-archived object or
  // one that does not exist. Not an error.
  if (!data) {
    if (format === 'json') {
      console.log(JSON.stringify({ status: null }));
    } else {
      printEmpty(context);
    }
    return;
  }

  const info = [
    { metric: 'Path', value: key },
    { metric: 'Status', value: data.status },
    ...(data.expiresAt
      ? [{ metric: 'Expires', value: data.expiresAt.toISOString() }]
      : []),
  ];

  const output = formatOutput(info, format, 'restore-info', 'info', [
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context, { bucket, key });
}
