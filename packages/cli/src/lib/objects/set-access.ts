import { getStorageConfig } from '@auth/provider.js';
import { setObjectAccess } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'set-access');

export default async function setAccess(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const accessArg = getOption<string>(options, ['access']);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  // When the user passes a full t3://bucket/key path as the first
  // positional, the second positional slot is the access value and
  // there is no third. Mirrors the resolution shape in objects put.
  const combined = resolveObjectArgs(bucketArg);
  const bucket = combined.bucket;
  const key = combined.key || keyArg;
  const access = combined.key ? keyArg : accessArg;

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  if (!access) {
    failWithError(context, 'Access level is required (public or private)');
  }

  if (access !== 'public' && access !== 'private') {
    failWithError(context, 'Access level must be either "public" or "private"');
  }

  const config = await getStorageConfig();

  const { error } = await setObjectAccess(key, {
    access,
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', bucket, key, access }));
  }

  printSuccess(context, { key, bucket, access });
}
