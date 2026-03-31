import { getStorageConfig } from '@auth/provider.js';
import { head } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput, formatSize } from '@utils/format.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'info');

export default async function objectInfo(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const snapshotVersion = getOption<string>(options, [
    'snapshot-version',
    'snapshotVersion',
    'snapshot',
  ]);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  const { bucket, key } = resolveObjectArgs(bucketArg, keyArg);

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await head(key, {
    ...(snapshotVersion ? { snapshotVersion } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data) {
    failWithError(context, 'Object not found');
  }

  const info = [
    { metric: 'Path', value: data.path },
    { metric: 'Size', value: formatSize(data.size) },
    { metric: 'Content-Type', value: data.contentType || 'N/A' },
    { metric: 'Content-Disposition', value: data.contentDisposition || 'N/A' },
    { metric: 'Modified', value: data.modified.toISOString() },
    { metric: 'URL', value: data.url },
  ];

  const output = formatOutput(info, format!, 'object-info', 'info', [
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context, { bucket, key });
}
