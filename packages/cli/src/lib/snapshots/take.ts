import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { createBucketSnapshot } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('snapshots', 'take');

export default async function take(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const snapshotName = getOption<string>(options, [
    'snapshot-name',
    'snapshotName',
  ]);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    exitWithError('Bucket name is required', context);
  }

  const config = await getStorageConfig();

  const { data, error } = await createBucketSnapshot(name, {
    name: snapshotName,
    config,
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context, {
    name,
    snapshotName: snapshotName || data?.snapshotVersion,
    version: data?.snapshotVersion,
  });
}
