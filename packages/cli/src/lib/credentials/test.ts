import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { listBuckets, getBucketInfo } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('credentials', 'test');

export default async function test(options: Record<string, unknown>) {
  printStart(context);

  const bucket = getOption<string>(options, ['bucket', 'b']);

  const config = await getStorageConfig();

  if (!config.accessKeyId && !config.sessionToken) {
    printFailure(
      context,
      'No credentials found. Run "tigris configure" or "tigris login" first.'
    );
    process.exit(1);
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
      process.exit(1);
    }

    console.log(`  Bucket: ${bucket}`);
    console.log(`  Access verified.`);
    if (data.sourceBucketName) {
      console.log(`  Fork of: ${data.sourceBucketName}`);
    }
  } else {
    // Test general access by listing buckets
    const { data, error } = await listBuckets({ config: finalConfig });

    if (error) {
      printFailure(context, "Current credentials don't have sufficient access");
      process.exit(1);
    }

    console.log(`  Access verified. Found ${data.buckets.length} bucket(s).`);
  }

  printSuccess(context);
}
