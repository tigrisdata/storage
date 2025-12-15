import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { listBuckets, getBucketInfo } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../utils/messages.js';

const context = msg('forks', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getOption<string>(options, ['format', 'f', 'F'], 'table');

  if (!name) {
    printFailure(context, 'Source bucket name is required');
    process.exit(1);
  }

  const config = await getStorageConfig();

  // First, check if the bucket has forks
  const { data: bucketInfo, error: infoError } = await getBucketInfo(name, {
    config,
  });

  if (infoError) {
    printFailure(context, infoError.message);
    process.exit(1);
  }

  if (!bucketInfo.hasForks) {
    printEmpty(context);
    return;
  }

  // List all buckets and filter for forks of the source bucket
  const { data, error } = await listBuckets({ config });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  // Get info for each bucket to find forks
  const forks: Array<{ name: string; created: Date }> = [];

  for (const bucket of data.buckets) {
    if (bucket.name === name) continue;

    const { data: info } = await getBucketInfo(bucket.name, { config });
    if (info?.sourceBucketName === name) {
      forks.push({
        name: bucket.name,
        created: bucket.creationDate,
      });
    }
  }

  if (forks.length === 0) {
    printEmpty(context);
    return;
  }

  const output = formatOutput(forks, format!, 'forks', 'fork', [
    { key: 'name', header: 'Name' },
    { key: 'created', header: 'Created' },
  ]);

  console.log(output);
  printSuccess(context, { count: forks.length });
}
