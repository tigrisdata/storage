import { getStorageConfig } from '@auth/provider.js';
import { put } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { getFormat, getOption } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

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

  const format = getFormat(options);

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
