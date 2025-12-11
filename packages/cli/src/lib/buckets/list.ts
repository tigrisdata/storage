import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { listBuckets } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  try {
    const format = getOption<string>(options, ['format', 'F'], 'table');

    const { data, error } = await listBuckets({
      config: await getStorageConfig(),
    });

    if (error) {
      printFailure(context, error.message);
      process.exit(1);
    }

    if (!data.buckets || data.buckets.length === 0) {
      printEmpty(context);
      return;
    }

    const buckets = data.buckets.map((bucket) => ({
      name: bucket.name,
      created: bucket.creationDate,
    }));

    const output = formatOutput(buckets, format!, 'buckets', 'bucket', [
      { key: 'name', header: 'Name' },
      { key: 'created', header: 'Created' },
    ]);

    console.log(output);
    printSuccess(context, { count: buckets.length });
  } catch (error) {
    if (error instanceof Error) {
      printFailure(context, error.message);
    } else {
      printFailure(context, 'An unknown error occurred');
    }
    process.exit(1);
  }
}
