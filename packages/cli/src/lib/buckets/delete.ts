import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { removeBucket } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'delete');

export default async function deleteBucket(options: Record<string, unknown>) {
  printStart(context);

  const names = getOption<string | string[]>(options, ['name']);

  if (!names) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  const bucketNames = Array.isArray(names) ? names : [names];
  const config = await getStorageConfig();

  for (const name of bucketNames) {
    const { error } = await removeBucket(name, { config });

    if (error) {
      printFailure(context, error.message, { name });
      process.exit(1);
    }

    printSuccess(context, { name });
  }
}
