import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { createBucketSnapshot } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

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
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { data, error } = await createBucketSnapshot(name, {
    name: snapshotName,
    config,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, {
    name,
    snapshotName: snapshotName || data?.snapshotVersion,
    version: data?.snapshotVersion,
  });
}
