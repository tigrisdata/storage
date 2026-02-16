import { getStorageConfig } from '../../auth/s3-client.js';
import { getOption } from '../../utils/options.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { updateObject } from '@tigrisdata/storage';

const context = msg('objects', 'set');

export default async function setObject(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket']);
  const key = getOption<string>(options, ['key']);
  const access = getOption<string>(options, ['access', 'a', 'A']);
  const newKey = getOption<string>(options, ['new-key', 'n', 'newKey']);

  if (!bucket) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  if (!key) {
    printFailure(context, 'Object key is required');
    process.exit(1);
  }

  if (!access) {
    printFailure(context, 'Access level is required (--access public|private)');
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { error } = await updateObject(key, {
    access: access === 'public' ? 'public' : 'private',
    ...(newKey && { key: newKey }),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { key, bucket });
}
