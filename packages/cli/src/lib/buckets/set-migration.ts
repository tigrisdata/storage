import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { setBucketMigration } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('buckets', 'set-migration');

export default async function setMigration(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const bucket = getOption<string>(options, ['bucket']);
  const endpoint = getOption<string>(options, ['endpoint']);
  const region = getOption<string>(options, ['region']);
  const accessKey = getOption<string>(options, ['access-key', 'accessKey']);
  const secretKey = getOption<string>(options, ['secret-key', 'secretKey']);
  const writeThrough = getOption<boolean>(options, [
    'write-through',
    'writeThrough',
  ]);
  const disable = getOption<boolean>(options, ['disable']);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    exitWithError('Bucket name is required', context);
  }

  if (
    disable &&
    (bucket !== undefined ||
      endpoint !== undefined ||
      region !== undefined ||
      accessKey !== undefined ||
      secretKey !== undefined ||
      writeThrough !== undefined)
  ) {
    printFailure(context, 'Cannot use --disable with other migration options');
    exitWithError('Cannot use --disable with other migration options', context);
  }

  const config = await getStorageConfig();
  const selectedOrg = getSelectedOrganization();
  const finalConfig = {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };

  if (disable) {
    const { error } = await setBucketMigration(name, {
      dataMigration: { enabled: false },
      config: finalConfig,
    });

    if (error) {
      printFailure(context, error.message);
      exitWithError(error, context);
    }

    printSuccess(context, { name });
    return;
  }

  if (!bucket || !endpoint || !region || !accessKey || !secretKey) {
    printFailure(
      context,
      'Required: --bucket, --endpoint, --region, --access-key, --secret-key'
    );
    exitWithError(
      'Required: --bucket, --endpoint, --region, --access-key, --secret-key',
      context
    );
  }

  const { error } = await setBucketMigration(name, {
    dataMigration: {
      enabled: true,
      accessKey,
      secretKey,
      region,
      name: bucket,
      endpoint,
      writeThrough: writeThrough ?? false,
    },
    config: finalConfig,
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context, { name });
}
