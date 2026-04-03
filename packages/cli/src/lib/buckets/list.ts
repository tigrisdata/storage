import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo, listBuckets } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const forksOf = getOption<string>(options, ['forks-of', 'forksOf']);
  const config = await getStorageConfig();

  const { data, error } = await listBuckets({ config });

  if (error) {
    failWithError(context, error);
  }

  if (!data.buckets || data.buckets.length === 0) {
    printEmpty(context);
    return;
  }

  if (forksOf) {
    // Filter for forks of the named source bucket
    const { data: bucketInfo, error: infoError } = await getBucketInfo(
      forksOf,
      { config }
    );

    if (infoError) {
      failWithError(context, infoError);
    }

    if (!bucketInfo.hasForks) {
      printEmpty(context);
      return;
    }

    const forks: Array<{ name: string; created: Date }> = [];

    for (const bucket of data.buckets) {
      if (bucket.name === forksOf) continue;
      const { data: info } = await getBucketInfo(bucket.name, { config });
      if (info?.sourceBucketName === forksOf) {
        forks.push({ name: bucket.name, created: bucket.creationDate });
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
    return;
  }

  const buckets = data.buckets.map((bucket) => ({
    name: bucket.name,
    created: bucket.creationDate,
  }));

  const output = formatOutput(buckets, format!, 'buckets', 'bucket', [
    { key: 'name', header: 'Name' },
    { key: 'created', header: 'Created' },
  ]);

  console.log(output);
  printSuccess(context, { count: buckets.length });
}
