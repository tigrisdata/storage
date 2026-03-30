import { getIAMConfig } from '@auth/iam.js';
import { removeAccessKey } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'delete');

export default async function remove(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);
  const force = getOption<boolean>(options, ['yes', 'y']);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(`Delete access key '${id}'?`);
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const config = await getIAMConfig(context);

  const { error } = await removeAccessKey(id, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'deleted', id }));
  }

  printSuccess(context);
}
