import { parseAnyPath } from '../utils/path.js';
import { formatOutput, formatSize } from '../utils/format.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { getStats, getBucketInfo, head } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../utils/messages.js';

const context = msg('stat');

export default async function stat(options: {
  path?: string;
  format?: string;
  _positional?: string[];
}) {
  printStart(context);

  const pathString = options.path || options._positional?.[0];
  const format = options.format || 'table';
  const config = await getStorageConfig();

  // No path: show overall stats
  if (!pathString) {
    const { data, error } = await getStats({ config });

    if (error) {
      printFailure(context, error.message);
      process.exit(1);
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

    const output = formatOutput(stats, format, 'stats', 'stat', [
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
    process.exit(1);
  }

  // Bucket only (no path or just trailing slash): show bucket info
  if (!path || path === '/') {
    const { data, error } = await getBucketInfo(bucket, { config });

    if (error) {
      printFailure(context, error.message);
      process.exit(1);
    }

    const info = [
      {
        metric: 'Number of Objects',
        value: data.sizeInfo.numberOfObjects?.toString() ?? 'N/A',
      },
      {
        metric: 'Total Size',
        value:
          data.sizeInfo.size !== undefined
            ? formatSize(data.sizeInfo.size)
            : 'N/A',
      },
      {
        metric: 'All Versions Count',
        value: data.sizeInfo.numberOfObjectsAllVersions?.toString() ?? 'N/A',
      },
      {
        metric: 'Snapshots Enabled',
        value: data.isSnapshotEnabled ? 'Yes' : 'No',
      },
      { metric: 'Default Tier', value: data.settings.defaultTier },
      {
        metric: 'Allow Object ACL',
        value: data.settings.allowObjectAcl ? 'Yes' : 'No',
      },
      { metric: 'Has Forks', value: data.forkInfo?.hasChildren ? 'Yes' : 'No' },
    ];

    if (data.forkInfo?.parents?.length) {
      info.push({
        metric: 'Forked From',
        value: data.forkInfo.parents[0].bucketName,
      });
      info.push({
        metric: 'Fork Snapshot',
        value: data.forkInfo.parents[0].snapshot,
      });
    }

    const output = formatOutput(info, format, 'bucket-info', 'info', [
      { key: 'metric', header: 'Metric' },
      { key: 'value', header: 'Value' },
    ]);

    console.log(output);
    printSuccess(context, { bucket });
    process.exit(0);
  }

  // Object path: show object metadata
  const { data, error } = await head(path, {
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  if (!data) {
    printFailure(context, 'Object not found');
    process.exit(1);
  }

  const info = [
    { metric: 'Path', value: data.path },
    { metric: 'Size', value: formatSize(data.size) },
    { metric: 'Content-Type', value: data.contentType || 'N/A' },
    { metric: 'Content-Disposition', value: data.contentDisposition || 'N/A' },
    { metric: 'Modified', value: data.modified.toISOString() },
  ];

  const output = formatOutput(info, format, 'object-info', 'info', [
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context, { bucket, path });
  process.exit(0);
}
