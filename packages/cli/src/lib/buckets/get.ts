import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getBucketInfo } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  const { data, error } = await getBucketInfo(name, {
    config: await getStorageConfig(),
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  const info = [
    { property: 'Name', value: name },
    {
      property: 'Snapshots Enabled',
      value: data.isSnapshotEnabled ? 'Yes' : 'No',
    },
    { property: 'Has Forks', value: data.hasForks ? 'Yes' : 'No' },
    ...(data.sourceBucketName
      ? [{ property: 'Source Bucket', value: data.sourceBucketName }]
      : []),
    ...(data.sourceBucketSnapshot
      ? [{ property: 'Source Snapshot', value: data.sourceBucketSnapshot }]
      : []),
  ];

  const output = formatOutput(info, 'table', 'bucket', 'property', [
    { key: 'property', header: 'Property' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context);
}
