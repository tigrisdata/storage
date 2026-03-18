import { getOption } from '../../../utils/options.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { isFlyUser } from '../../../auth/fly.js';
import { inviteUser } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../../utils/messages.js';
import { exitWithError } from '../../../utils/exit.js';

const context = msg('iam users', 'invite');

export default async function invite(options: Record<string, unknown>) {
  printStart(context);

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Users can only be invited when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    exitWithError(
      'Users can only be invited when logged in via OAuth.\nRun "tigris login oauth" first.',
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

  const emailOption = getOption<string | string[]>(options, ['email']);
  const roleInput = getOption<string>(options, ['role', 'r']) ?? 'member';

  const emails = Array.isArray(emailOption)
    ? emailOption
    : emailOption
      ? [emailOption]
      : [];

  if (emails.length === 0) {
    printFailure(context, 'Email address is required');
    exitWithError('Email address is required', context);
  }

  const validRoles = ['admin', 'member'] as const;
  type Role = (typeof validRoles)[number];

  if (!validRoles.includes(roleInput as Role)) {
    printFailure(
      context,
      `Invalid role "${roleInput}". Must be one of: ${validRoles.join(', ')}`
    );
    exitWithError(
      `Invalid role "${roleInput}". Must be one of: ${validRoles.join(', ')}`,
      context
    );
  }

  const role: Role = roleInput as Role;

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

  const invitations = emails.map((email) => ({ email, role }));

  const { error } = await inviteUser(invitations, {
    config: {
      sessionToken: accessToken,
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
      mgmtEndpoint: tigrisConfig.mgmtEndpoint,
    },
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  printSuccess(context, { email: emails.join(', ') });
}
