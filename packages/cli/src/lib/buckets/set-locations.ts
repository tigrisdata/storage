import { getStorageConfigWithOrg } from '@auth/provider.js';
import type { BucketLocations } from '@tigrisdata/storage';
import { updateBucket } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { parseLocations, promptLocations } from '@utils/locations.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'set-locations');

export default async function setLocations(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const locations = getOption<string | string[]>(options, ['locations']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  let parsedLocations: BucketLocations;
  if (locations !== undefined) {
    parsedLocations = parseLocations(locations);
  } else {
    requireInteractive('Provide --locations flag');
    try {
      parsedLocations = await promptLocations();
    } catch (err) {
      failWithError(context, err);
    }
  }

  const finalConfig = await getStorageConfigWithOrg();

  const { error } = await updateBucket(name, {
    locations: parsedLocations,
    config: finalConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', bucket: name }));
  }

  printSuccess(context, { name });
}
