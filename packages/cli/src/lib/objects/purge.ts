import { getStorageConfig } from '@auth/provider.js';
import { purgeDeletedObject } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'purge');

export default async function purge(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const bucketArg = getOption<string>(options, ['bucket']);
  const keyArg = getOption<string>(options, ['key']);
  const versionId = getOption<string>(options, ['version-id', 'versionId']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

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

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Permanently destroy version '${versionId}' of '${key}' in '${bucket}'? It can no longer be restored.`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const config = await getStorageConfig();

  const { error } = await purgeDeletedObject(key, versionId, {
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
        action: 'purged',
        bucket,
        key,
        versionId,
      })
    );
  }

  printSuccess(context, { key, bucket, versionId });
}
