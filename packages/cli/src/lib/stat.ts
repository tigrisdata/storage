import { parseAnyPath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { formatOutput, formatSize } from '../utils/format.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { getStats, getBucketInfo, head } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../utils/messages.js';
import { buildBucketInfo } from '../utils/bucket-info.js';
import { exitWithError } from '../utils/exit.js';

const context = msg('stat');

export default async function stat(options: Record<string, unknown>) {
  printStart(context);

  const pathString = getOption<string>(options, ['path']);
  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');
  const snapshotVersion = getOption<string>(options, [
    'snapshot-version',
    'snapshotVersion',
    'snapshot',
  ]);
  const config = await getStorageConfig();

  // No path: show overall stats
  if (!pathString) {
    const { data, error } = await getStats({ config });

    if (error) {
      printFailure(context, error.message);
      exitWithError(error, context);
    }

    const stats = [
      { metric: 'Active Buckets', value: String(data.stats.activeBuckets) },
      { metric: 'Total Objects', value: String(data.stats.totalObjects) },
      {
        metric: 'Total Unique Objects',
        value: String(data.stats.totalUniqueObjects),
      },
      {
        metric: 'Total Storage',
        value: formatSize(data.stats.totalStorageBytes),
      },
    ];

    const output = formatOutput(stats, format!, 'stats', 'stat', [
      { key: 'metric', header: 'Metric' },
      { key: 'value', header: 'Value' },
    ]);

    console.log(output);
    printSuccess(context);
    process.exit(0);
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    printFailure(context, 'Invalid path');
    exitWithError('Invalid path', context);
  }

  // Bucket only (no path or just trailing slash): show bucket info
  if (!path || path === '/') {
    const { data, error } = await getBucketInfo(bucket, { config });

    if (error) {
      printFailure(context, error.message);
      exitWithError(error, context);
    }

    const info = buildBucketInfo(data).map(({ label, value }) => ({
      metric: label,
      value,
    }));

    const output = formatOutput(info, format!, 'bucket-info', 'info', [
      { key: 'metric', header: 'Metric' },
      { key: 'value', header: 'Value' },
    ]);

    console.log(output);
    printSuccess(context, { bucket });
    process.exit(0);
  }

  // Object path: show object metadata
  const { data, error } = await head(path, {
    ...(snapshotVersion ? { snapshotVersion } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  if (!data) {
    printFailure(context, 'Object not found');
    exitWithError('Object not found', context);
  }

  const info = [
    { metric: 'Path', value: data.path },
    { metric: 'Size', value: formatSize(data.size) },
    { metric: 'Content-Type', value: data.contentType || 'N/A' },
    { metric: 'Content-Disposition', value: data.contentDisposition || 'N/A' },
    { metric: 'Modified', value: data.modified.toISOString() },
  ];

  const output = formatOutput(info, format!, 'object-info', 'info', [
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context, { bucket, path });
  process.exit(0);
}
