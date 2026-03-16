import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { remove } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { requireInteractive, confirm } from '../../utils/interactive.js';

const context = msg('objects', 'delete');

export default async function deleteObject(options: Record<string, unknown>) {
  printStart(context);

  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');

  const bucket = getOption<string>(options, ['bucket']);
  const keys = getOption<string | string[]>(options, ['key']);
  const force = getOption<boolean>(options, ['force', 'yes', 'y']);

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

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Delete ${keyList.length} object(s) from '${bucket}'?`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const deleted: string[] = [];
  const errors: { key: string; error: string }[] = [];
  for (const key of keyList) {
    const { error } = await remove(key, {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      printFailure(context, error.message, { key });
      errors.push({ key, error: error.message });
    } else {
      deleted.push(key);
      printSuccess(context, { key });
    }
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'deleted', bucket, keys: deleted, errors })
    );
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}
