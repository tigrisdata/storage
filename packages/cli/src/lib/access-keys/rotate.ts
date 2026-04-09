import { getIAMConfig } from '@auth/iam.js';
import { rotateAccessKey } from '@tigrisdata/iam';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'rotate');

export default async function rotate(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Rotate access key '${id}'? The current secret will be invalidated.`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const config = await getIAMConfig(context);

  const { data, error } = await rotateAccessKey(id, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { id: data.id });
    const output: Record<string, unknown> = {
      action: 'rotated',
      id: data.id,
      secret: data.newSecret,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  } else {
    console.log(`  Access Key ID: ${data.id}`);
    console.log(`  New Secret Access Key: ${data.newSecret}`);
    console.log('');
    console.log(
      '  Save these credentials securely. The secret will not be shown again.'
    );
  }

  printSuccess(context);
  printNextActions(context, { id: data.id });
}
