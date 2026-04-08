import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo, listBuckets } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput, formatPaginatedOutput } from '@utils/format.js';
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
  const { limit, pageToken, isPaginated } = getPaginationOptions(options);
  const config = await getStorageConfig();

  if (forksOf && isPaginated) {
    console.warn(
      '⚠ Pagination flags are ignored when --forks-of is used (all buckets are fetched for filtering)'
    );
  }

  const { data, error } = await listBuckets({
    ...(forksOf || !isPaginated
      ? {}
      : {
          ...(limit !== undefined ? { limit } : {}),
          ...(pageToken ? { paginationToken: pageToken } : {}),
        }),
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data.buckets || data.buckets.length === 0) {
    printEmpty(context);
    return;
  }

  if (forksOf) {
    // Filter for forks of the named source bucket
    const { data: bucketInfo, error: infoError } = await getBucketInfo(
      forksOf,
      { config }
    );

    if (infoError) {
      failWithError(context, infoError);
    }

    if (!bucketInfo.hasForks) {
      printEmpty(context);
      return;
    }

    const forks: Array<{ name: string; created: Date }> = [];

    for (const bucket of data.buckets) {
      if (bucket.name === forksOf) continue;
      const { data: info } = await getBucketInfo(bucket.name, { config });
      if (info?.sourceBucketName === forksOf) {
        forks.push({ name: bucket.name, created: bucket.creationDate });
      }
    }

    if (forks.length === 0) {
      printEmpty(context);
      return;
    }

    const output = formatOutput(forks, format!, 'forks', 'fork', [
      { key: 'name', header: 'Name' },
      { key: 'created', header: 'Created' },
    ]);

    console.log(output);
    printSuccess(context, { count: forks.length });
    return;
  }

  const buckets = data.buckets.map((bucket) => ({
    name: bucket.name,
    created: bucket.creationDate,
  }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'created', header: 'Created' },
  ];

  const nextToken = data.paginationToken || undefined;

  const output = isPaginated
    ? formatPaginatedOutput(buckets, format!, 'buckets', 'bucket', columns, {
        paginationToken: nextToken,
      })
    : formatOutput(buckets, format!, 'buckets', 'bucket', columns);

  console.log(output);

  if (isPaginated && format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: buckets.length });
}
