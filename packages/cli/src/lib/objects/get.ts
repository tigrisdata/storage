import { writeFileSync } from 'fs';
import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { get } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('objects', 'get');

export default async function getObject(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket']);
  const key = getOption<string>(options, ['key']);
  const output = getOption<string>(options, ['output', 'o', 'O']);

  if (!bucket) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  if (!key) {
    printFailure(context, 'Object key is required');
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { data, error } = await get(key, 'string', {
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  if (output) {
    writeFileSync(output, data);
    printSuccess(context, { key, output });
  } else {
    console.log(data);
    printSuccess(context);
  }
}
