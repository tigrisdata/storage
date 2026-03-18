import { getOption } from '../../utils/options.js';
import { getLoginMethod } from '../../auth/s3-client.js';
import { getAuthClient } from '../../auth/client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { getTigrisConfig } from '../../auth/config.js';
import { getAccessKey } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError } from '../../utils/exit.js';

const context = msg('access-keys', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');

  const id = getOption<string>(options, ['id']);

  if (!id) {
    printFailure(context, 'Access key ID is required');
    exitWithError('Access key ID is required', context);
  }

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Access keys can only be retrieved when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    exitWithError(
      'Access keys can only be retrieved when logged in via OAuth.\nRun "tigris login oauth" first.',
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

  const { data, error } = await getAccessKey(id, {
    config: {
      sessionToken: accessToken,
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
    },
  });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  if (format === 'json') {
    console.log(JSON.stringify(data));
  } else {
    console.log(`  Name: ${data.name}`);
    console.log(`  ID: ${data.id}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Created: ${data.createdAt}`);
    console.log(`  Organization: ${data.organizationId}`);

    if (data.roles && data.roles.length > 0) {
      console.log(`  Roles:`);
      for (const role of data.roles) {
        console.log(`    - ${role.bucket}: ${role.role}`);
      }
    } else {
      console.log(`  Roles: None`);
    }
  }

  printSuccess(context);
}
