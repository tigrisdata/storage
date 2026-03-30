import { getStorageConfig } from '@auth/provider.js';
import { removeBucket } from '@tigrisdata/storage';
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

const context = msg('buckets', 'delete');

export default async function deleteBucket(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const names = getOption<string | string[]>(options, ['name']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (!names) {
    failWithError(context, 'Bucket name is required');
  }

  const bucketNames = Array.isArray(names) ? names : [names];
  const config = await getStorageConfig();

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(`Delete ${bucketNames.length} bucket(s)?`);
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const deleted: string[] = [];
  const errors: { name: string; error: string }[] = [];
  for (const name of bucketNames) {
    const { error } = await removeBucket(name, { config });

    if (error) {
      printFailure(context, error.message, { name });
      errors.push({ name, error: error.message });
    } else {
      deleted.push(name);
      printSuccess(context, { name });
    }
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context);
    const output: Record<string, unknown> = {
      action: 'deleted',
      names: deleted,
      errors,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  if (errors.length > 0) {
    exitWithError(errors[0].error, context);
  }

  printNextActions(context);
}
