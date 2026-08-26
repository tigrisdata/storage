import { getStorageConfig } from '@auth/provider.js';
import { restoreDeletedObject } from '@tigrisdata/storage';
import { failWithError, printNextActions } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'restore-deleted');

export default async function restoreDeleted(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const versionId = getOption<string>(options, ['version-id', 'versionId']);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  const { bucket, key } = resolveObjectArgs(bucketArg, keyArg);

  if (!key) {
    failWithError(context, 'Object key is required');
  }

  // The spec marks --version-id required, so the CLI rejects a missing one
  // before reaching here. Kept as a guard for direct callers of this handler.
  if (!versionId) {
    failWithError(context, '--version-id is required');
  }

  const config = await getStorageConfig();

  const { error } = await restoreDeletedObject(key, versionId, {
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
        action: 'restored',
        bucket,
        key,
        versionId,
      })
    );
  }

  printSuccess(context, { key, bucket });
  printNextActions(context, { bucket });
}
