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

const context = msg('buckets', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  try {
    const json = getOption<boolean>(options, ['json']);
    const format = json
      ? 'json'
      : getOption<string>(options, ['format', 'f', 'F'], 'table');
    const forksOf = getOption<string>(options, ['forks-of', 'forksOf']);
    const config = await getStorageConfig();

    const { data, error } = await listBuckets({ config });

    if (error) {
      printFailure(context, error.message);
      process.exit(1);
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
        printFailure(context, infoError.message);
        process.exit(1);
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
  } catch (error) {
    if (error instanceof Error) {
      printFailure(context, error.message);
    } else {
      printFailure(context, 'An unknown error occurred');
    }
    process.exit(1);
  }
}
