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
import { buildBucketInfo } from '../../utils/bucket-info.js';

const context = msg('buckets', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getOption<string>(options, ['format']) || 'table';

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
    ...buildBucketInfo(data).map(({ label, value }) => ({
      property: label,
      value,
    })),
  ];

  const output = formatOutput(info, format, 'bucket', 'property', [
    { key: 'property', header: 'Property' },
    { key: 'value', header: 'Value' },
  ]);

  console.log(output);
  printSuccess(context);
}
