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
  const forksOnly = getOption<boolean>(options, ['forks-only', 'forksOnly']);
  const owner = getOption<string>(options, ['owner']);
  // A bare `--owner` parses as `true`: a missing value, not a filter.
  if (
    owner !== undefined &&
    (typeof owner !== 'string' || owner.trim() === '')
  ) {
    failWithError(context, '--owner requires a username (an email address)');
  }
  const { limit, pageToken } = getPaginationOptions(options);
  const config = await getStorageConfig();

  // --forks-of is its own listing; the filters below do not apply to it.
  const ignoredWithForksOf = [
    deleted && '--deleted',
    forksOnly && '--forks-only',
    owner && '--owner',
  ].filter(Boolean);
  if (forksOf && ignoredWithForksOf.length > 0) {
    console.warn(
      `⚠ ${ignoredWithForksOf.join(', ')} ignored when --forks-of is used; use ${ignoredWithForksOf.length > 1 ? 'them' : 'it'} without --forks-of`
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
    ...(forksOnly ? { forksOnly } : {}),
    ...(owner ? { owner } : {}),
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
