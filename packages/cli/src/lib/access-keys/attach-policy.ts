import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getIAMConfig } from '@auth/iam.js';
import {
  attachPolicyToAccessKey,
  listPolicies,
  listPoliciesForAccessKey,
} from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'attach-policy');

export default async function attachPolicy(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);
  let policyArn = getOption<string>(options, ['policyArn', 'policy-arn']);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  const config = await getIAMConfig(context);

  if (!policyArn) {
    requireInteractive('Use --policy-arn to specify the policy ARN');

    // Fetch all policies and assigned policies in parallel
    const [allPoliciesResult, assignedResult] = await Promise.all([
      listPolicies({ config }),
      listPoliciesForAccessKey(id, { config }),
    ]);

    if (allPoliciesResult.error) {
      failWithError(context, allPoliciesResult.error);
    }

    if (assignedResult.error) {
      failWithError(context, assignedResult.error);
    }

    const assignedNames = new Set(assignedResult.data.policies);
    const available = allPoliciesResult.data.policies.filter(
      (p) => !assignedNames.has(p.name)
    );

    if (available.length === 0) {
      failWithError(
        context,
        'No unassigned policies available. All policies are already attached to this access key.'
      );
    }

    const { selected } = await prompt<{ selected: string }>({
      type: 'select',
      name: 'selected',
      message: 'Select a policy to attach:',
      choices: available.map((p) => ({
        name: p.resource,
        message: `${p.name} (${p.resource})`,
      })),
    });

    policyArn = selected;
  }

  const { error } = await attachPolicyToAccessKey(id, policyArn, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'attached', id, policyArn }));
  }

  printSuccess(context);
}
