import { getStorageConfig } from '@auth/provider.js';
import { updateObject } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('objects', 'set');

export default async function setObject(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const bucket = getOption<string>(options, ['bucket']);
  const key = getOption<string>(options, ['key']);
  const access = getOption<string>(options, ['access', 'a', 'A']);
  const newKey = getOption<string>(options, ['new-key', 'n', 'newKey']);

  if (!bucket) {
    failWithError(context, 'Bucket name is required');
  }

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

  const { error } = await updateObject(key, {
    access: access === 'public' ? 'public' : 'private',
    ...(newKey && { key: newKey }),
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
        action: 'updated',
        bucket,
        key,
        access,
        ...(newKey ? { newKey } : {}),
      })
    );
  }

  printSuccess(context, { key, bucket });
}
