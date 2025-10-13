import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';

export default async function list(options: Record<string, unknown>) {
  console.log('🪣 Listing Buckets');

  const format = getOption<string>(options, ['format', 'F'], 'table');

  // Mock data for demonstration
  const buckets = [
    {
      name: 'user-uploads',
      access: 'private',
      tier: 'STANDARD',
      region: 'usa',
      objects: 1250,
      size: '2.3 GB',
      created: '2024-01-15',
    },
    {
      name: 'static-assets',
      access: 'public',
      tier: 'STANDARD',
      region: 'global',
      objects: 45,
      size: '156 MB',
      created: '2024-02-01',
    },
    {
      name: 'backups',
      access: 'private',
      tier: 'GLACIER',
      region: 'eur',
      objects: 89,
      size: '8.7 GB',
      created: '2024-01-20',
    },
  ];

  const output = formatOutput(buckets, format!, 'buckets', 'bucket', [
    { key: 'name', header: 'Name', width: 15 },
    { key: 'access', header: 'Access', width: 7 },
    { key: 'tier', header: 'Tier', width: 9 },
    { key: 'region', header: 'Region', width: 6 },
    { key: 'objects', header: 'Objects', width: 7, align: 'right' },
    { key: 'size', header: 'Size', width: 8, align: 'right' },
    { key: 'created', header: 'Created', width: 10 },
  ]);

  console.log(output);
  console.log(`Found ${buckets.length} bucket(s)`);
}
