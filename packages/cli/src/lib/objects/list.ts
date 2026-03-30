import { getStorageConfig } from '@auth/provider.js';
import { list } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput, formatSize } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('objects', 'list');

export default async function listObjects(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket']);
  const prefix = getOption<string>(options, ['prefix', 'p', 'P']);
  const format = getFormat(options);
  const snapshotVersion = getOption<string>(options, [
    'snapshot-version',
    'snapshotVersion',
    'snapshot',
  ]);

  if (!bucket) {
    failWithError(context, 'Bucket name is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await list({
    prefix: prefix || undefined,
    ...(snapshotVersion ? { snapshotVersion } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data.items || data.items.length === 0) {
    printEmpty(context);
    return;
  }

  const objects = data.items.map((item) => ({
    key: item.name,
    size: formatSize(item.size),
    modified: item.lastModified,
  }));

  const output = formatOutput(objects, format!, 'objects', 'object', [
    { key: 'key', header: 'Key' },
    { key: 'size', header: 'Size' },
    { key: 'modified', header: 'Modified' },
  ]);

  console.log(output);
  printSuccess(context, { count: objects.length });
}
