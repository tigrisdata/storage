import enquirer from 'enquirer';
const { prompt } = enquirer;
import { requireInteractive } from '../../../utils/interactive.js';
import { getOption } from '../../../utils/options.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { isFlyUser } from '../../../auth/fly.js';
import { updateUserRole, listUsers } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../../utils/messages.js';
import { exitWithError } from '../../../utils/exit.js';

const context = msg('iam users', 'update-role');

export default async function updateRole(options: Record<string, unknown>) {
  printStart(context);

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'User roles can only be updated when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    exitWithError(
      'User roles can only be updated when logged in via OAuth.\nRun "tigris login oauth" first.',
      context
    );
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

  const validRoles = ['admin', 'member'] as const;
  type Role = (typeof validRoles)[number];

  const roleOption = getOption<string | string[]>(options, ['role', 'r']);

  if (!roleOption) {
    printFailure(
      context,
      'Role is required. Use --role admin or --role member'
    );
    exitWithError(
      'Role is required. Use --role admin or --role member',
      context
    );
  }

  const roles = Array.isArray(roleOption) ? roleOption : [roleOption];

  for (const r of roles) {
    if (!validRoles.includes(r as Role)) {
      printFailure(
        context,
        `Invalid role "${r}". Must be one of: ${validRoles.join(', ')}`
      );
      exitWithError(
        `Invalid role "${r}". Must be one of: ${validRoles.join(', ')}`,
        context
      );
    }
  }

  const resourceOption = getOption<string | string[]>(options, ['resource']);

  let resources = Array.isArray(resourceOption)
    ? resourceOption
    : resourceOption
      ? [resourceOption]
      : [];

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
  const tigrisConfig = getTigrisConfig();

  const iamConfig = {
    sessionToken: accessToken,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint: tigrisConfig.iamEndpoint,
    mgmtEndpoint: tigrisConfig.mgmtEndpoint,
  };

  // If no resource provided, list users and let user select
  if (resources.length === 0) {
    const { data: listData, error: listError } = await listUsers({
      config: iamConfig,
    });

    if (listError) {
      printFailure(context, listError.message);
      exitWithError(listError, context);
    }

    if (listData.users.length === 0) {
      printEmpty(context);
      return;
    }

    requireInteractive('Provide user ID(s) as a positional argument');

    const { selected } = await prompt<{ selected: string[] }>({
      type: 'multiselect',
      name: 'selected',
      message: 'Select user(s) to update (space to select, enter to confirm):',
      choices: listData.users.map((user) => ({
        name: user.userId,
        message: `${user.email} (${user.isOrgOwner ? 'owner' : user.role})`,
      })),
    });

    resources = selected;
  }

  // Pair roles with users: if one role given, apply to all; otherwise pair 1:1
  if (roles.length > 1 && roles.length !== resources.length) {
    printFailure(
      context,
      `Number of roles (${roles.length}) must match number of users (${resources.length}), or provide a single role for all users`
    );
    exitWithError(
      `Number of roles (${roles.length}) must match number of users (${resources.length}), or provide a single role for all users`,
      context
    );
  }

  const roleUpdates = resources.map((userId, i) => ({
    userId,
    role: (roles.length === 1 ? roles[0] : roles[i]) as Role,
  }));

  const { error } = await updateUserRole(roleUpdates, {
    config: iamConfig,
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context);
}
