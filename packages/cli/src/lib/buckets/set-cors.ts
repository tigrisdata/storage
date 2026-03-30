import { getStorageConfigWithOrg } from '@auth/provider.js';
import { setBucketCors } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'set-cors');

export default async function setCors(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

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
    failWithError(context, 'Bucket name is required');
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
    failWithError(context, 'Cannot use --reset with other options');
  }

  if (!reset && !origins) {
    failWithError(context, 'Provide --origins or --reset');
  }

  if (maxAge !== undefined && (isNaN(Number(maxAge)) || Number(maxAge) <= 0)) {
    failWithError(context, '--max-age must be a positive number');
  }

  const finalConfig = await getStorageConfigWithOrg();

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
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', bucket: name }));
  }

  printSuccess(context, { name });
}
