import { getOAuthIAMConfig } from '@auth/iam.js';
import { deletePolicy } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { selectPolicy } from './select-policy.js';

const context = msg('iam policies', 'delete');

export default async function del(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let resource = getOption<string>(options, ['resource']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  const iamConfig = await getOAuthIAMConfig(context);

  if (!resource) {
    const selected = await selectPolicy(
      iamConfig,
      context,
      'Select a policy to delete:'
    );
    if (!selected) return;
    resource = selected;
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(`Delete policy '${resource}'?`);
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { error } = await deletePolicy(resource, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'deleted', arn: resource }));
  }

  printSuccess(context, { resource });
}
