import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo, getStats, head } from '@tigrisdata/storage';
import { buildBucketInfo } from '@utils/bucket-info.js';
import { failWithError } from '@utils/exit.js';
import { formatOutput, formatSize } from '@utils/format.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

const context = msg('stat');

export default async function stat(options: Record<string, unknown>) {
  printStart(context);

  const pathString = getOption<string>(options, ['path']);
  const format = getFormat(options);
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
      failWithError(context, error);
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
    failWithError(context, 'Invalid path');
  }

  // Bucket only (no path or just trailing slash): show bucket info
  if (!path || path === '/') {
    const { data, error } = await getBucketInfo(bucket, { config });

    if (error) {
      failWithError(context, error);
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
  ];

  const output = formatOutput(info, format!, 'object-info', 'info', [
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context, { bucket, path });
  process.exit(0);
}
