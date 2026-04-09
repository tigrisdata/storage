import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOAuthIAMConfig } from '@auth/iam.js';
import {
  attachPolicyToAccessKey,
  getPolicy,
  listAccessKeys,
} from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { selectPolicy } from './select-policy.js';

const context = msg('iam policies', 'link-key');

export default async function linkKey(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let resource = getOption<string>(options, ['resource']);
  let id = getOption<string>(options, ['id']);

  const iamConfig = await getOAuthIAMConfig(context);

  if (!resource) {
    const selected = await selectPolicy(iamConfig, context);
    if (!selected) return;
    resource = selected;
  }

  // If no access key ID provided, let user select from unattached keys
  if (!id) {
    requireInteractive('Use --id to specify the access key ID');

    const [keysResult, policyResult] = await Promise.all([
      listAccessKeys({ config: iamConfig }),
      getPolicy(resource, { config: iamConfig }),
    ]);

    if (keysResult.error) {
      failWithError(context, keysResult.error);
    }

    if (policyResult.error) {
      failWithError(context, policyResult.error);
    }

    const attachedIds = new Set(
      (policyResult.data.users ?? []).map((u) => u.id)
    );
    const available = keysResult.data.accessKeys.filter(
      (k) => !attachedIds.has(k.id)
    );

    if (available.length === 0) {
      failWithError(
        context,
        'No unlinked access keys available. All access keys are already linked to this policy.'
      );
    }

    const { selected } = await prompt<{ selected: string }>({
      type: 'select',
      name: 'selected',
      message: 'Select an access key to link:',
      choices: available.map((k) => ({
        name: k.id,
        message: `${k.name} (${k.id})`,
      })),
    });

    id = selected;
  }

  const { error } = await attachPolicyToAccessKey(id, resource, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'linked', policyArn: resource, id }));
  }

  printSuccess(context);
}
