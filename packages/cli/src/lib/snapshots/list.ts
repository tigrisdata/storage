import { getStorageConfig } from '@auth/provider.js';
import { listBucketSnapshots } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatPaginatedOutput } from '@utils/format.js';
import {
  msg,
  printEmpty,
  printPaginationHint,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption, getPaginationOptions } from '@utils/options.js';

const context = msg('snapshots', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getFormat(options);
  const { limit, pageToken } = getPaginationOptions(options);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await listBucketSnapshots(name, {
    ...(limit !== undefined ? { limit } : {}),
    ...(pageToken ? { paginationToken: pageToken } : {}),
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data.snapshots || data.snapshots.length === 0) {
    printEmpty(context);
    return;
  }

  const snapshots = data.snapshots.map((snapshot) => ({
    name: snapshot.name || '',
    version: snapshot.version || '',
    created: snapshot.creationDate,
  }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'version', header: 'Version' },
    { key: 'created', header: 'Created' },
  ];

  const nextToken = data.paginationToken || undefined;

  const output = formatPaginatedOutput(
    snapshots,
    format!,
    'snapshots',
    'snapshot',
    columns,
    { paginationToken: nextToken }
  );

  console.log(output);

  if (format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: snapshots.length });
}
