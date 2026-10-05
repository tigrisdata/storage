import { getIAMConfig } from '@auth/iam.js';
import { removeAccessKey } from '@tigrisdata/iam';
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

const context = msg('access-keys', 'delete');

export default async function remove(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const idOption = getOption<string | string[]>(options, ['id']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (!idOption) {
    failWithError(context, 'Access key ID is required');
  }

  const ids = Array.isArray(idOption) ? idOption : [idOption];

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      ids.length === 1
        ? `Delete access key '${ids[0]}'?`
        : `Delete ${ids.length} access keys: ${ids.join(', ')}?`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const config = await getIAMConfig(context);

  const deleted: string[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const id of ids) {
    const { error } = await removeAccessKey(id, { config });

    if (error) {
      printFailure(context, error.message, { id });
      errors.push({ id, error: error.message });
    } else {
      deleted.push(id);
      printSuccess(context, { id });
    }
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context);
    const output: Record<string, unknown> = {
      action: 'deleted',
      ids: deleted,
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
