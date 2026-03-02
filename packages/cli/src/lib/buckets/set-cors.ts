import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { setBucketCors } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'set-cors');

export default async function setCors(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const origins = getOption<string>(options, ['origins']);
  const methods = getOption<string>(options, ['methods']);
  const headers = getOption<string>(options, ['headers']);
  const exposeHeaders = getOption<string>(options, [
    'expose-headers',
    'exposeHeaders',
  ]);
  const maxAge = getOption<string>(options, ['max-age', 'maxAge']);
  const override = getOption<boolean>(options, ['override']);
  const reset = getOption<boolean>(options, ['reset']);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  if (
    reset &&
    (origins !== undefined ||
      methods !== undefined ||
      headers !== undefined ||
      exposeHeaders !== undefined ||
      maxAge !== undefined ||
      override)
  ) {
    printFailure(context, 'Cannot use --reset with other options');
    process.exit(1);
  }

  if (!reset && !origins) {
    printFailure(context, 'Provide --origins or --reset');
    process.exit(1);
  }

  if (maxAge !== undefined && (isNaN(Number(maxAge)) || Number(maxAge) <= 0)) {
    printFailure(context, '--max-age must be a positive number');
    process.exit(1);
  }

  const config = await getStorageConfig();
  const selectedOrg = getSelectedOrganization();
  const finalConfig = {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };

  const { error } = await setBucketCors(name, {
    rules: reset
      ? []
      : [
          {
            allowedOrigins: origins!,
            ...(methods !== undefined ? { allowedMethods: methods } : {}),
            ...(headers !== undefined ? { allowedHeaders: headers } : {}),
            ...(exposeHeaders !== undefined ? { exposeHeaders } : {}),
            maxAge: maxAge !== undefined ? Number(maxAge) : 3600,
          },
        ],
    override: override ?? false,
    config: finalConfig,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { name });
}
