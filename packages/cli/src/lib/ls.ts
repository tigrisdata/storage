import { getStorageConfig } from '@auth/provider.js';
import { list, listBuckets } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { formatPaginatedOutput, formatSize } from '@utils/format.js';
import { printPaginationHint } from '@utils/messages.js';
import { getFormat, getOption, getPaginationOptions } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

export default async function ls(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);
  const snapshotVersion = getOption<string>(options, [
    'snapshot-version',
    'snapshotVersion',
    'snapshot',
  ]);
  const format = getFormat(options);
  const source = getOption<'tigris' | 'shadow'>(options, ['source']);
  const { limit, pageToken } = getPaginationOptions(options);

  if (!pathString) {
    // No path provided, list all buckets
    const config = await getStorageConfig();
    const { data, error } = await listBuckets({
      ...(limit !== undefined ? { limit } : {}),
      ...(pageToken ? { paginationToken: pageToken } : {}),
      config,
    });

    if (error) {
      exitWithError(error);
    }

    const buckets = (data.buckets || []).map((bucket) => ({
      name: bucket.name,
      created: bucket.creationDate,
    }));

    const columns = [
      { key: 'name', header: 'Name' },
      { key: 'created', header: 'Created' },
    ];

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

    return;
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    exitWithError('Invalid path');
  }

  const config = await getStorageConfig();

  // Normalize prefix: ensure trailing slash for directory-like listing
  const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : undefined;

  const { data, error } = await list({
    prefix,
    delimiter: '/',
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
    exitWithError(error);
  }

  // Common prefixes are "folders" returned by S3 when using a delimiter
  const folders = (data.commonPrefixes || []).map((p) => {
    const displayName = prefix ? p.slice(prefix.length) : p;
    return {
      key: displayName,
      size: '-',
      modified: '',
    };
  });

  // Items are files at this level (filter out empty keys from folder marker objects)
  const files = (data.items || [])
    .map((item) => {
      const displayName = prefix ? item.name.slice(prefix.length) : item.name;
      return {
        key: displayName,
        size: formatSize(item.size),
        modified: item.lastModified,
      };
    })
    .filter((item) => item.key !== '');

  const objects = [...folders, ...files];

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
}
