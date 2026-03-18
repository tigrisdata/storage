import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { setBucketTtl } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('buckets', 'set-ttl');

export default async function setTtl(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const days = getOption<string>(options, ['days']);
  const date = getOption<string>(options, ['date']);
  const enable = getOption<boolean>(options, ['enable']);
  const disable = getOption<boolean>(options, ['disable']);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    exitWithError('Bucket name is required', context);
  }

  if (enable && disable) {
    printFailure(context, 'Cannot use both --enable and --disable');
    exitWithError('Cannot use both --enable and --disable', context);
  }

  if (disable && (days !== undefined || date !== undefined)) {
    printFailure(context, 'Cannot use --disable with --days or --date');
    exitWithError('Cannot use --disable with --days or --date', context);
  }

  if (!enable && !disable && days === undefined && date === undefined) {
    printFailure(context, 'Provide --days, --date, --enable, or --disable');
    exitWithError('Provide --days, --date, --enable, or --disable', context);
  }

  if (days !== undefined && (isNaN(Number(days)) || Number(days) <= 0)) {
    printFailure(context, '--days must be a positive number');
    exitWithError('--days must be a positive number', context);
  }

  if (date !== undefined) {
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}/.test(date) ||
      isNaN(new Date(date).getTime())
    ) {
      printFailure(
        context,
        '--date must be a valid ISO-8601 date (e.g. 2026-06-01)'
      );
      exitWithError(
        '--date must be a valid ISO-8601 date (e.g. 2026-06-01)',
        context
      );
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

  const ttlConfig = {
    ...(enable ? { enabled: true } : {}),
    ...(disable ? { enabled: false } : {}),
    ...(days !== undefined ? { days: Number(days) } : {}),
    ...(date !== undefined ? { date } : {}),
  };

  const { error } = await setBucketTtl(name, {
    ttlConfig,
    config: finalConfig,
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context, { name });
}
