import { getStorageConfig } from '@auth/provider.js';
import { restoreObject } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'restore');

export default async function restore(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const versionId = getOption<string>(options, ['version-id', 'versionId']);
  const daysArg = getOption<string | number>(options, ['days', 'd']);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  const { bucket, key } = resolveObjectArgs(bucketArg, keyArg);

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  let days: number | undefined;
  if (daysArg !== undefined) {
    days = Number(daysArg);
    if (!Number.isInteger(days) || days < 1) {
      failWithError(context, '--days must be a positive integer');
    }
  }

  const config = await getStorageConfig();

  const { error } = await restoreObject(key, {
    ...(days !== undefined ? { days } : {}),
    ...(versionId ? { versionId } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: 'restore-requested',
        bucket,
        key,
        days: days ?? 1,
      })
    );
  }

  printSuccess(context, { key, bucket });
}
