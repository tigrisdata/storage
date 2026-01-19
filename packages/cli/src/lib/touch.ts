import { parsePath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { put } from '@tigrisdata/storage';

export default async function touch(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    console.error('path argument is required');
    process.exit(1);
  }

  const { bucket, path } = parsePath(pathString);

  if (!bucket) {
    console.error('Invalid path');
    process.exit(1);
  }

  if (!path) {
    console.error('Object key is required (use mk to create buckets)');
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { error } = await put(path, '', {
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Created '${bucket}/${path}'`);
  process.exit(0);
}
