import { getStorageConfig } from '@auth/provider.js';
import { getSelectedOrganization } from '@auth/storage.js';
import { getBucketInfo, listBuckets } from '@tigrisdata/storage';
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

  const config = await getStorageConfig();

  if (!config.accessKeyId && !config.sessionToken) {
    failWithError(
      context,
      'No credentials found. Run "tigris configure" or "tigris login" first.'
    );
  }

  // Include organization ID if available
  const selectedOrg = getSelectedOrganization();
  const finalConfig = {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };

  if (bucket) {
    // Test access to specific bucket
    const { data, error } = await getBucketInfo(bucket, {
      config: finalConfig,
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
          ...(data.sourceBucketName ? { forkOf: data.sourceBucketName } : {}),
        })
      );
    } else {
      console.log(`  Bucket: ${bucket}`);
      console.log(`  Access verified.`);
      if (data.sourceBucketName) {
        console.log(`  Fork of: ${data.sourceBucketName}`);
      }
    }
  } else {
    // Test general access by listing buckets
    const { data, error } = await listBuckets({ config: finalConfig });

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
