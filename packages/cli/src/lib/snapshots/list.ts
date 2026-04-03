import { getStorageConfig } from '@auth/provider.js';
import { listBucketSnapshots } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('snapshots', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getFormat(options);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await listBucketSnapshots(name, { config });

  if (error) {
    failWithError(context, error);
  }

  if (!data || data.length === 0) {
    printEmpty(context);
    return;
  }

  const snapshots = data.map((snapshot) => ({
    name: snapshot.name || '',
    version: snapshot.version || '',
    created: snapshot.creationDate,
  }));

  const output = formatOutput(snapshots, format!, 'snapshots', 'snapshot', [
    { key: 'name', header: 'Name' },
    { key: 'version', header: 'Version' },
    { key: 'created', header: 'Created' },
  ]);

  console.log(output);
  printSuccess(context, { count: snapshots.length });
}
