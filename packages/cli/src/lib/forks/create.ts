import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { createBucket } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('forks', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const forkName = getOption<string>(options, ['fork-name', 'forkName']);
  const snapshot = getOption<string>(options, ['snapshot', 's', 'S']);

  if (!name) {
    printFailure(context, 'Source bucket name is required');
    exitWithError('Source bucket name is required', context);
  }

  if (!forkName) {
    printFailure(context, 'Fork name is required');
    exitWithError('Fork name is required', context);
  }

  const { error } = await createBucket(forkName, {
    sourceBucketName: name,
    sourceBucketSnapshot: snapshot,
    config: await getStorageConfig(),
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context, { name, forkName });
}
