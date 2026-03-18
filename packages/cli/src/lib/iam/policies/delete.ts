import enquirer from 'enquirer';
const { prompt } = enquirer;
import { requireInteractive, confirm } from '../../../utils/interactive.js';
import { getOption } from '../../../utils/options.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { deletePolicy, listPolicies } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../../utils/messages.js';
import { exitWithError } from '../../../utils/exit.js';

const context = msg('iam policies', 'delete');

export default async function del(options: Record<string, unknown>) {
  printStart(context);

  let resource = getOption<string>(options, ['resource']);
  const force = getOption<boolean>(options, ['force', 'yes', 'y']);

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Policies can only be deleted when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    exitWithError(
      'Policies can only be deleted when logged in via OAuth.\nRun "tigris login oauth" first.',
      context
    );
  }

  const authClient = getAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (!isAuthenticated) {
    printFailure(context, 'Not authenticated. Run "tigris login oauth" first.');
    exitWithError(
      'Not authenticated. Run "tigris login oauth" first.',
      context
    );
  }

  const accessToken = await authClient.getAccessToken();
  const selectedOrg = getSelectedOrganization();
  const tigrisConfig = getTigrisConfig();

  const iamConfig = {
    sessionToken: accessToken,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint: tigrisConfig.iamEndpoint,
  };

  // If no resource provided, list policies and let user select
  if (!resource) {
    const { data: listData, error: listError } = await listPolicies({
      config: iamConfig,
    });

    if (listError) {
      printFailure(context, listError.message);
      exitWithError(listError, context);
    }

    if (!listData.policies || listData.policies.length === 0) {
      printEmpty(context);
      return;
    }

    requireInteractive('Provide the policy ARN as a positional argument');

    const { selected } = await prompt<{ selected: string }>({
      type: 'select',
      name: 'selected',
      message: 'Select a policy to delete:',
      choices: listData.policies.map((p) => ({
        name: p.resource,
        message: `${p.name} (${p.resource})`,
      })),
    });

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
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context, { resource });
}
