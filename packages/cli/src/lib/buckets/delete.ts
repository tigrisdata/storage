import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { removeBucket } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { requireInteractive, confirm } from '../../utils/interactive.js';

const context = msg('buckets', 'delete');

export default async function deleteBucket(options: Record<string, unknown>) {
  printStart(context);

  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');

  const names = getOption<string | string[]>(options, ['name']);
  const force = getOption<boolean>(options, ['force', 'yes', 'y']);

  if (!names) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  const bucketNames = Array.isArray(names) ? names : [names];
  const config = await getStorageConfig();

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(`Delete ${bucketNames.length} bucket(s)?`);
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const deleted: string[] = [];
  const errors: { name: string; error: string }[] = [];
  for (const name of bucketNames) {
    const { error } = await removeBucket(name, { config });

    if (error) {
      printFailure(context, error.message, { name });
      errors.push({ name, error: error.message });
    } else {
      deleted.push(name);
      printSuccess(context, { name });
    }
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'deleted', names: deleted, errors }));
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}
