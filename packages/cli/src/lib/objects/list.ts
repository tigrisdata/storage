import { getStorageConfig } from '@auth/provider.js';
import { list } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatPaginatedOutput, formatSize } from '@utils/format.js';
import {
  msg,
  printEmpty,
  printPaginationHint,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption, getPaginationOptions } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

const context = msg('objects', 'list');

export default async function listObjects(options: Record<string, unknown>) {
  printStart(context);

  const bucketArg = getOption<string>(options, ['bucket']);
  const prefixFlag = getOption<string>(options, ['prefix', 'p', 'P']);
  const format = getFormat(options);
  const snapshotVersion = getOption<string>(options, [
    'snapshot-version',
    'snapshotVersion',
    'snapshot',
  ]);
  const source = getOption<'tigris' | 'shadow'>(options, ['source']);
  const { limit, pageToken } = getPaginationOptions(options);

  if (!bucketArg) {
    failWithError(context, 'Bucket name is required');
  }

  const parsed = parseAnyPath(bucketArg);
  const bucket = parsed.bucket;
  const prefix = prefixFlag || parsed.path || undefined;

  const config = await getStorageConfig();

  const { data, error } = await list({
    prefix,
    ...(snapshotVersion ? { snapshotVersion } : {}),
    ...(source ? { source } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(pageToken ? { paginationToken: pageToken } : {}),
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

  const columns = [
    { key: 'key', header: 'Key' },
    { key: 'size', header: 'Size' },
    { key: 'modified', header: 'Modified' },
  ];

  const nextToken = data.paginationToken || undefined;

  const output = formatPaginatedOutput(
    objects,
    format!,
    'objects',
    'object',
    columns,
    { paginationToken: nextToken }
  );

  console.log(output);

  if (format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: objects.length });
}
