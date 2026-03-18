import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { updateBucket } from '@tigrisdata/storage';
import type { BucketLocations } from '@tigrisdata/storage';
import { parseLocations, promptLocations } from '../../utils/locations.js';
import { requireInteractive } from '../../utils/interactive.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('buckets', 'set-locations');

export default async function setLocations(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const locations = getOption<string | string[]>(options, ['locations']);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    exitWithError('Bucket name is required', context);
  }

  let parsedLocations: BucketLocations;
  if (locations !== undefined) {
    parsedLocations = parseLocations(locations);
  } else {
    requireInteractive('Provide --locations flag');
    try {
      parsedLocations = await promptLocations();
    } catch (err) {
      printFailure(context, (err as Error).message);
      exitWithError(err, context);
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
    exitWithError(error, context);
  }

  printSuccess(context, { name });
}
