import { getStorageConfig } from '@auth/provider.js';
import { restoreBucket } from '@tigrisdata/storage';
import {
  exitWithError,
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'restore');

export default async function restore(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const name = getOption<string>(options, ['name']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const { data, error } = await restoreBucket(name, {
    config: await getStorageConfig(),
  });

  if (error) {
    printFailure(context, error.message, { name });
    exitWithError(error, context);
  }

  if (!data.restored) {
    const message = 'Bucket could not be restored';
    printFailure(context, message, { name });
    exitWithError(message, context);
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { name });
    const output: Record<string, unknown> = {
      action: 'restored',
      name,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  printSuccess(context, { name });
  printNextActions(context, { name });
}
