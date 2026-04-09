import enquirer from 'enquirer';
const { prompt } = enquirer;
import { listPolicies } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { type MessageContext, printEmpty } from '@utils/messages.js';

/**
 * Interactively select a policy ARN. Returns undefined if no policies exist.
 */
export async function selectPolicy(
  iamConfig: NonNullable<Parameters<typeof listPolicies>[0]>['config'],
  context: MessageContext,
  message: string = 'Select a policy:'
): Promise<string | undefined> {
  const { data: listData, error: listError } = await listPolicies({
    config: iamConfig,
  });

  if (listError) {
    failWithError(context, listError);
  }

  if (!listData.policies || listData.policies.length === 0) {
    printEmpty(context);
    return undefined;
  }

  requireInteractive('Provide the policy ARN as a positional argument');

  const { selected } = await prompt<{ selected: string }>({
    type: 'select',
    name: 'selected',
    message,
    choices: listData.policies.map((p) => ({
      name: p.resource,
      message: `${p.name} (${p.resource})`,
    })),
  });

  return selected;
}
