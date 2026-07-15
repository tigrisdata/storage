import { getStorageConfigWithOrg } from '@auth/provider.js';
import { disableSnapshot } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'disable-snapshots');

export default async function disableSnapshots(
  options: Record<string, unknown>
) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const finalConfig = await getStorageConfigWithOrg();

  // disableSnapshot rejects when the bucket still has dependent forks; that
  // error is surfaced as-is via failWithError.
  const { error } = await disableSnapshot(name, { config: finalConfig });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'snapshots-disabled', name }));
  }

  printSuccess(context, { name });
}
