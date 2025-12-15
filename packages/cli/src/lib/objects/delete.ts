import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { remove } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('objects', 'delete');

export default async function deleteObject(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket']);
  const keys = getOption<string | string[]>(options, ['key']);

  if (!bucket) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  if (!keys) {
    printFailure(context, 'Object key is required');
    process.exit(1);
  }

  const config = await getStorageConfig();
  const keyList = Array.isArray(keys) ? keys : [keys];

  for (const key of keyList) {
    const { error } = await remove(key, {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      printFailure(context, error.message, { key });
      process.exit(1);
    }

    printSuccess(context, { key });
  }
}
