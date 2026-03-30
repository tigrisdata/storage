import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo, listBuckets } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('forks', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getFormat(options);

  if (!name) {
    failWithError(context, 'Source bucket name is required');
  }

  const config = await getStorageConfig();

  // First, check if the bucket has forks
  const { data: bucketInfo, error: infoError } = await getBucketInfo(name, {
    config,
  });

  if (infoError) {
    failWithError(context, infoError);
  }

  if (!bucketInfo.hasForks) {
    printEmpty(context);
    return;
  }

  // List all buckets and filter for forks of the source bucket
  const { data, error } = await listBuckets({ config });

  if (error) {
    failWithError(context, error);
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
