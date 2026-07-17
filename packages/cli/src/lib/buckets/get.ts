import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo } from '@tigrisdata/storage';
import { buildBucketInfo } from '@utils/bucket-info.js';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getFormat(options);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const { data, error } = await getBucketInfo(name, {
    config: await getStorageConfig(),
  });

  if (error) {
    failWithError(context, error);
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
