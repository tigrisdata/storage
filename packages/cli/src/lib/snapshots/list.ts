import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { listBucketSnapshots } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('snapshots', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');

  if (!name) {
    printFailure(context, 'Bucket name is required');
    exitWithError('Bucket name is required', context);
  }

  const config = await getStorageConfig();

  const { data, error } = await listBucketSnapshots(name, { config });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
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
