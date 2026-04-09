import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOAuthIAMConfig } from '@auth/iam.js';
import { detachPolicyFromAccessKey, getPolicy } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { selectPolicy } from './select-policy.js';

const context = msg('iam policies', 'unlink-key');

export default async function unlinkKey(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let resource = getOption<string>(options, ['resource']);
  let id = getOption<string>(options, ['id']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  const iamConfig = await getOAuthIAMConfig(context);

  if (!resource) {
    const selected = await selectPolicy(iamConfig, context);
    if (!selected) return;
    resource = selected;
  }

  // If no access key ID provided, let user select from attached keys
  if (!id) {
    requireInteractive('Use --id to specify the access key ID');

    const { data: policyData, error: policyError } = await getPolicy(resource, {
      config: iamConfig,
    });

    if (policyError) {
      failWithError(context, policyError);
    }

    if (!policyData.users || policyData.users.length === 0) {
      failWithError(context, 'No access keys are linked to this policy.');
    }

    const { selected } = await prompt<{ selected: string }>({
      type: 'select',
      name: 'selected',
      message: 'Select an access key to unlink:',
      choices: policyData.users.map((u) => ({
        name: u.id,
        message: `${u.name} (${u.id})`,
      })),
    });

    id = selected;
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Unlink access key '${id}' from policy '${resource}'?`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { error } = await detachPolicyFromAccessKey(id, resource, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'unlinked', policyArn: resource, id })
    );
  }

  printSuccess(context);
}
