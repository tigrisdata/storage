import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getS3Client } from '../../auth/s3-client.js';
import { ListBucketsCommand } from '@aws-sdk/client-s3';

export default async function list(options: Record<string, unknown>) {
  console.log('🪣 Listing Buckets');

  try {
    const format = getOption<string>(options, ['format', 'F'], 'table');

    // Get S3 client
    const client = await getS3Client();

    // List buckets using AWS SDK
    const command = new ListBucketsCommand({});

    const response = await client.send(command);

    if (!response.Buckets || response.Buckets.length === 0) {
      console.log('No buckets found');
      return;
    }

    // Transform AWS response to match expected format
    const buckets = response.Buckets.map((bucket) => ({
      name: bucket.Name || '',
      created: bucket.CreationDate
        ? bucket.CreationDate.toISOString().split('T')[0]
        : 'N/A',
    }));

    const output = formatOutput(buckets, format!, 'buckets', 'bucket', [
      { key: 'name', header: 'Name', width: 50 },
      { key: 'created', header: 'Created', width: 50 },
    ]);

    console.log(output);
    console.log(`Found ${buckets.length} bucket(s)`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Failed to list buckets: ${error.message}`);

      if (error.message.includes('Not authenticated')) {
        console.log(
          '💡 Run "tigris login" or "tigris configure" to authenticate\n'
        );
      } else if (error.message.includes('No organization selected')) {
        console.log('💡 Run "tigris orgs select" to choose an organization\n');
      }
    } else {
      console.error('\n❌ An unknown error occurred');
    }
    process.exit(1);
  }
}
