import { getOption } from '../../utils/options.js';
import { getLoginMethod } from '../../auth/s3-client.js';
import { getAuthClient } from '../../auth/client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { getTigrisConfig } from '../../auth/config.js';
import { removeAccessKey } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('access-keys', 'delete');

export default async function remove(options: Record<string, unknown>) {
  printStart(context);

  const id = getOption<string>(options, ['id']);

  if (!id) {
    printFailure(context, 'Access key ID is required');
    process.exit(1);
  }

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Access keys can only be deleted when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    process.exit(1);
  }

  const authClient = getAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (!isAuthenticated) {
    printFailure(context, 'Not authenticated. Run "tigris login oauth" first.');
    process.exit(1);
  }

  const accessToken = await authClient.getAccessToken();
  const selectedOrg = getSelectedOrganization();
  const tigrisConfig = getTigrisConfig();

  const { error } = await removeAccessKey(id, {
    config: {
      sessionToken: accessToken,
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context);
}
