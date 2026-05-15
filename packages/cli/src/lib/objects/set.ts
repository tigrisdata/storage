import { getStorageConfig } from '@auth/provider.js';
import { move, setObjectAccess } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'set');

export default async function setObject(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const access = getOption<string>(options, ['access', 'a', 'A']);
  const newKey = getOption<string>(options, ['new-key', 'n', 'newKey']);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  const { bucket, key } = resolveObjectArgs(bucketArg, keyArg);

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  if (!access) {
    failWithError(
      context,
      'Access level is required (--access public|private)'
    );
  }

  const config = await getStorageConfig();
  const finalConfig = { ...config, bucket };

  // Rename first so the access update targets the renamed object.
  let currentKey = key;
  if (newKey) {
    const { error: moveError } = await move(key, newKey, {
      config: finalConfig,
    });
    if (moveError) {
      failWithError(context, moveError);
    }
    currentKey = newKey;
  }

  const { error } = await setObjectAccess(currentKey, {
    access: access === 'public' ? 'public' : 'private',
    config: finalConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: 'updated',
        bucket,
        key: currentKey,
        access,
        ...(newKey ? { newKey } : {}),
      })
    );
  }

  printSuccess(context, { key: currentKey, bucket });
}
