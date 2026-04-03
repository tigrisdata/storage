import { getStorageConfigWithOrg } from '@auth/provider.js';
import {
  type BucketLifecycleRule,
  setBucketLifecycle,
} from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'set-transition');

const VALID_TRANSITION_CLASSES = ['STANDARD_IA', 'GLACIER', 'GLACIER_IR'];

export default async function setTransitions(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const storageClass = getOption<string>(options, [
    'storage-class',
    'storageClass',
  ]);
  const days = getOption<string>(options, ['days']);
  const date = getOption<string>(options, ['date']);
  const enable = getOption<boolean>(options, ['enable']);
  const disable = getOption<boolean>(options, ['disable']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  if (enable && disable) {
    failWithError(context, 'Cannot use both --enable and --disable');
  }

  if (
    disable &&
    (days !== undefined || date !== undefined || storageClass !== undefined)
  ) {
    failWithError(
      context,
      'Cannot use --disable with --days, --date, or --storage-class'
    );
  }

  if (!enable && !disable && days === undefined && date === undefined) {
    failWithError(context, 'Provide --days, --date, --enable, or --disable');
  }

  if ((days !== undefined || date !== undefined) && !storageClass) {
    failWithError(
      context,
      '--storage-class is required when setting --days or --date'
    );
  }

  if (storageClass && !VALID_TRANSITION_CLASSES.includes(storageClass)) {
    failWithError(
      context,
      `--storage-class must be one of: ${VALID_TRANSITION_CLASSES.join(', ')} (STANDARD is not a valid transition target)`
    );
  }

  if (days !== undefined && (isNaN(Number(days)) || Number(days) <= 0)) {
    failWithError(context, '--days must be a positive number');
  }

  if (date !== undefined) {
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}/.test(date) ||
      isNaN(new Date(date).getTime())
    ) {
      failWithError(
        context,
        '--date must be a valid ISO-8601 date (e.g. 2026-06-01)'
      );
    }
  }

  const finalConfig = await getStorageConfigWithOrg();

  const rule: BucketLifecycleRule = {
    ...(enable ? { enabled: true } : {}),
    ...(disable ? { enabled: false } : {}),
    ...(storageClass
      ? { storageClass: storageClass as BucketLifecycleRule['storageClass'] }
      : {}),
    ...(days !== undefined ? { days: Number(days) } : {}),
    ...(date !== undefined ? { date } : {}),
  };

  const { error } = await setBucketLifecycle(name, {
    lifecycleRules: [rule],
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
