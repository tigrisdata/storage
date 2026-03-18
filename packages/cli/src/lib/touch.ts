import { parseAnyPath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { put } from '@tigrisdata/storage';
import { exitWithError } from '../utils/exit.js';

export default async function touch(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    exitWithError('path argument is required');
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    exitWithError('Invalid path');
  }

  if (!path) {
    exitWithError('Object key is required (use mk to create buckets)');
  }

  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');

  const config = await getStorageConfig();

  const { error } = await put(path, '', {
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    exitWithError(error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'created', bucket, path }));
  } else {
    console.log(`Created '${bucket}/${path}'`);
  }
  process.exit(0);
}
