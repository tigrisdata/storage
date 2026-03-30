import { getStorageConfig } from '@auth/provider.js';
import { createBucketSnapshot } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('snapshots', 'take');

export default async function take(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const snapshotName = getOption<string>(options, [
    'snapshot-name',
    'snapshotName',
  ]);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await createBucketSnapshot(name, {
    name: snapshotName,
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: 'taken',
        bucket: name,
        version: data?.snapshotVersion,
      })
    );
  }

  printSuccess(context, {
    name,
    snapshotName: snapshotName || data?.snapshotVersion,
    version: data?.snapshotVersion,
  });
}
