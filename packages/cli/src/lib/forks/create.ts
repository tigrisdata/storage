import { getStorageConfig } from '@auth/provider.js';
import { createBucket } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('forks', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const forkName = getOption<string>(options, ['fork-name', 'forkName']);
  const snapshot = getOption<string>(options, ['snapshot', 's', 'S']);

  if (!name) {
    failWithError(context, 'Source bucket name is required');
  }

  if (!forkName) {
    failWithError(context, 'Fork name is required');
  }

  const { error } = await createBucket(forkName, {
    sourceBucketName: name,
    sourceBucketSnapshot: snapshot,
    config: await getStorageConfig(),
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'created', name: forkName, forkOf: name })
    );
  }

  printSuccess(context, { name, forkName });
}
