import { getIAMConfig } from '@auth/iam.js';
import { setAccessKeyScope } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import {
  describeDefaultPermissions,
  getDefaultPermissions,
} from './default-permissions.js';

const context = msg('access-keys', 'set');

export default async function set(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const id = getOption<string>(options, ['id']);
  const scope = getDefaultPermissions(context, options);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }
  if (!scope) {
    failWithError(
      context,
      'Nothing to change: pass --default-permissions enable or disable'
    );
  }

  const config = await getIAMConfig(context);

  const { error } = await setAccessKeyScope(id, scope, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', id, scope }));
  }

  printSuccess(context, { id, setting: describeDefaultPermissions(scope) });
}
