import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getIAMConfig } from '@auth/iam.js';
import {
  detachPolicyFromAccessKey,
  listPolicies,
  listPoliciesForAccessKey,
} from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'detach-policy');

export default async function detachPolicy(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);
  let policyArn = getOption<string>(options, ['policyArn', 'policy-arn']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  const config = await getIAMConfig(context);

  if (!policyArn) {
    requireInteractive('Use --policy-arn to specify the policy ARN');

    // Fetch assigned policy names and all policies to resolve ARNs
    const [assignedResult, allPoliciesResult] = await Promise.all([
      listPoliciesForAccessKey(id, { config }),
      listPolicies({ config }),
    ]);

    if (assignedResult.error) {
      failWithError(context, assignedResult.error);
    }

    if (allPoliciesResult.error) {
      failWithError(context, allPoliciesResult.error);
    }

    const assignedNames = new Set(assignedResult.data.policies);
    const assigned = allPoliciesResult.data.policies.filter((p) =>
      assignedNames.has(p.name)
    );

    if (assigned.length === 0) {
      failWithError(context, 'No policies are attached to this access key.');
    }

    const { selected } = await prompt<{ selected: string }>({
      type: 'select',
      name: 'selected',
      message: 'Select a policy to detach:',
      choices: assigned.map((p) => ({
        name: p.resource,
        message: `${p.name} (${p.resource})`,
      })),
    });

    policyArn = selected;
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Detach policy '${policyArn}' from access key '${id}'?`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { error } = await detachPolicyFromAccessKey(id, policyArn, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'detached', id, policyArn }));
  }

  printSuccess(context);
}
