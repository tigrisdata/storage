import { getStorageConfig } from '@auth/provider.js';
import { remove } from '@tigrisdata/storage';
import {
  exitWithError,
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('objects', 'delete');

export default async function deleteObject(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const bucket = getOption<string>(options, ['bucket']);
  const keys = getOption<string | string[]>(options, ['key']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (!bucket) {
    failWithError(context, 'Bucket name is required');
  }

  if (!keys) {
    failWithError(context, 'Object key is required');
  }

  const config = await getStorageConfig();
  const keyList = Array.isArray(keys) ? keys : [keys];

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Delete ${keyList.length} object(s) from '${bucket}'?`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const deleted: string[] = [];
  const errors: { key: string; error: string }[] = [];
  for (const key of keyList) {
    const { error } = await remove(key, {
      config: {
        ...config,
        bucket,
      },
    });

    if (error) {
      printFailure(context, error.message, { key });
      errors.push({ key, error: error.message });
    } else {
      deleted.push(key);
      printSuccess(context, { key });
    }
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { bucket });
    const jsonOutput: Record<string, unknown> = {
      action: 'deleted',
      bucket,
      keys: deleted,
      errors,
    };
    if (nextActions.length > 0) jsonOutput.nextActions = nextActions;
    console.log(JSON.stringify(jsonOutput));
  }

  if (errors.length > 0) {
    exitWithError(errors[0].error, context);
  }

  printNextActions(context, { bucket });
}
