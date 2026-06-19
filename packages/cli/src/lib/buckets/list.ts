import { getStorageConfig } from '@auth/provider.js';
import { listBuckets, listForks } from '@tigrisdata/storage';
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

const context = msg('buckets', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const forksOf = getOption<string>(options, ['forks-of', 'forksOf']);
  const deleted = getOption<boolean>(options, ['deleted']);
  const { limit, pageToken } = getPaginationOptions(options);
  const config = await getStorageConfig();

  if (forksOf && deleted) {
    console.warn(
      '⚠ --deleted is ignored when --forks-of is used; use --deleted on its own to list soft-deleted buckets'
    );
  }

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'created', header: 'Created' },
  ];

  if (forksOf) {
    // Filter for forks of the named source bucket
    const { data, error: infoError } = await listForks(forksOf, {
      ...(limit !== undefined ? { limit } : {}),
      ...(pageToken ? { paginationToken: pageToken } : {}),
      config,
    });

    if (infoError) {
      failWithError(context, infoError);
    }

    if (!data.forks || data.forks.length === 0) {
      printEmpty(context);
      return;
    }

    const forks: Array<{ name: string; created: Date }> = [];

    for (const bucket of data.forks) {
      forks.push({ name: bucket.name!, created: bucket.creationDate! });
    }

    const nextToken = data.paginationToken || undefined;

    const output = formatPaginatedOutput(
      forks,
      format!,
      'forks',
      'fork',
      columns,
      { paginationToken: nextToken }
    );

    console.log(output);

    if (format !== 'json' && format !== 'xml') {
      printPaginationHint(nextToken);
    }

    printSuccess(context, { count: forks.length });
    return;
  }

  const { data, error } = await listBuckets({
    ...(limit !== undefined ? { limit } : {}),
    ...(pageToken ? { paginationToken: pageToken } : {}),
    ...(deleted ? { deleted } : {}),
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data.buckets || data.buckets.length === 0) {
    printEmpty(context);
    return;
  }

  const buckets = data.buckets.map((bucket) => ({
    name: bucket.name,
    created: bucket.creationDate,
  }));

  const nextToken = data.paginationToken || undefined;

  const output = formatPaginatedOutput(
    buckets,
    format!,
    'buckets',
    'bucket',
    columns,
    { paginationToken: nextToken }
  );

  console.log(output);

  if (format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: buckets.length });
}
