import { getStorageConfigWithOrg } from '@auth/provider.js';
import { setBucketMigration } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'set-migration');

export default async function setMigration(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

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
    failWithError(context, 'Bucket name is required');
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
    failWithError(context, 'Cannot use --disable with other migration options');
  }

  const finalConfig = await getStorageConfigWithOrg();

  if (disable) {
    const { error } = await setBucketMigration(name, {
      dataMigration: { enabled: false },
      config: finalConfig,
    });

    if (error) {
      failWithError(context, error);
    }

    if (format === 'json') {
      console.log(JSON.stringify({ action: 'updated', bucket: name }));
    }

    printSuccess(context, { name });
    return;
  }

  if (!bucket || !endpoint || !region || !accessKey || !secretKey) {
    failWithError(
      context,
      'Required: --bucket, --endpoint, --region, --access-key, --secret-key'
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
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', bucket: name }));
  }

  printSuccess(context, { name });
}
