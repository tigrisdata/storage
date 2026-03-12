import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { updateBucket } from '@tigrisdata/storage';
import type { BucketLocations } from '@tigrisdata/storage';
import { parseLocations, promptLocations } from '../../utils/locations.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'set-locations');

export default async function setLocations(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const locations = getOption<string | string[]>(options, ['locations']);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  let parsedLocations: BucketLocations;
  if (locations !== undefined) {
    parsedLocations = parseLocations(locations);
  } else {
    try {
      parsedLocations = await promptLocations();
    } catch (err) {
      printFailure(context, (err as Error).message);
      process.exit(1);
    }
  }

  const config = await getStorageConfig();
  const selectedOrg = getSelectedOrganization();
  const finalConfig = {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };

  const { error } = await updateBucket(name, {
    locations: parsedLocations,
    config: finalConfig,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { name });
}
