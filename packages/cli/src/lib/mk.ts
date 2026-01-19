import { parsePath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { createBucket, put } from '@tigrisdata/storage';

export default async function mk(options: Record<string, unknown>) {
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

  const config = await getStorageConfig();

  if (!path) {
    // Create a bucket
    const { error } = await createBucket(bucket, { config });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.log(`Bucket '${bucket}' created`);
    process.exit(0);
  } else {
    // Create a "folder" (empty object with trailing slash)
    const folderPath = path.endsWith('/') ? path : `${path}/`;

    const { error } = await put(folderPath, '', {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.log(`Folder '${bucket}/${folderPath}' created`);
    process.exit(0);
  }
}
