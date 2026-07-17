import { getStorageConfigWithOrg } from '@auth/provider.js';
import { list, listBuckets } from '@tigrisdata/storage';
import { exitWithError, failWithError } from '@utils/exit.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('credentials', 'test');

export default async function test(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const bucket = getOption<string>(options, ['bucket', 'b']);

  const config = await getStorageConfigWithOrg();

  if (!config.accessKeyId && !config.sessionToken) {
    failWithError(
      context,
      'No credentials found. Run "tigris configure" or "tigris login" first.'
    );
  }

  if (bucket) {
    // Test access to specific bucket by listing objects
    const { error } = await list({
      config: { ...config, bucket },
      limit: 1, // just to check if we can list objects
    });

    if (error) {
      printFailure(
        context,
        `Current credentials don't have access to bucket "${bucket}"`
      );
      exitWithError(error, context);
    }

    if (format === 'json') {
      console.log(
        JSON.stringify({
          valid: true,
          bucket,
        })
      );
    } else {
      console.log(`  Bucket: ${bucket}`);
      console.log(`  Access verified.`);
    }
  } else {
    // Test general access by listing buckets
    const { data, error } = await listBuckets({ config });

    if (error) {
      printFailure(context, "Current credentials don't have sufficient access");
      exitWithError(error, context);
    }

    if (format === 'json') {
      console.log(
        JSON.stringify({ valid: true, bucketCount: data.buckets.length })
      );
    } else {
      console.log(`  Access verified. Found ${data.buckets.length} bucket(s).`);
    }
  }

  printSuccess(context);
}
