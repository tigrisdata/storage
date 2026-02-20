import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOption } from '../../../utils/options.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { isFlyUser } from '../../../auth/fly.js';
import { removeUser as removeUserFromOrg, listUsers } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../../utils/messages.js';

const context = msg('iam users', 'remove');

export default async function removeUser(options: Record<string, unknown>) {
  printStart(context);

  const resourceOption = getOption<string | string[]>(options, ['resource']);

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Users can only be removed when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    process.exit(1);
  }

  const selectedOrg = getSelectedOrganization();

  if (isFlyUser(selectedOrg ?? undefined)) {
    console.log(
      'User management is not available for Fly.io organizations.\n' +
        'Your users are managed through Fly.io.\n\n' +
        'Visit https://fly.io to manage your organization members.'
    );
    return;
  }

  const authClient = getAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (!isAuthenticated) {
    printFailure(context, 'Not authenticated. Run "tigris login oauth" first.');
    process.exit(1);
  }

  const accessToken = await authClient.getAccessToken();
  const tigrisConfig = getTigrisConfig();

  const iamConfig = {
    sessionToken: accessToken,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint: tigrisConfig.iamEndpoint,
    mgmtEndpoint: tigrisConfig.mgmtEndpoint,
  };

  let resources = Array.isArray(resourceOption)
    ? resourceOption
    : resourceOption
      ? [resourceOption]
      : [];

  // If no resource provided, list users and let user select
  if (resources.length === 0) {
    const { data: listData, error: listError } = await listUsers({
      config: iamConfig,
    });

    if (listError) {
      printFailure(context, listError.message);
      process.exit(1);
    }

    if (listData.users.length === 0) {
      printEmpty(context);
      return;
    }

    const { selected } = await prompt<{ selected: string[] }>({
      type: 'multiselect',
      name: 'selected',
      message: 'Select user(s) to remove (space to select, enter to confirm):',
      choices: listData.users.map((user) => ({
        name: user.userId,
        message: `${user.email} (${user.isOrgOwner ? 'owner' : user.role})`,
      })),
    });

    resources = selected;
  }

  const { error } = await removeUserFromOrg(resources, {
    config: iamConfig,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context);
}
