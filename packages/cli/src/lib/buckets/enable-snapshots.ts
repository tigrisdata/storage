import { getStorageConfigWithOrg } from '@auth/provider.js';
import { enableSnapshot } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'enable-snapshots');

export default async function enableSnapshots(
  options: Record<string, unknown>
) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const finalConfig = await getStorageConfigWithOrg();

  const { error } = await enableSnapshot(name, { config: finalConfig });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'snapshots-enabled', name }));
  }

  printSuccess(context, { name });
}
