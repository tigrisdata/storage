import { getOption } from '../../utils/options.js';
import { getLoginMethod } from '../../auth/s3-client.js';
import { getAuthClient } from '../../auth/client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { getTigrisConfig } from '../../auth/config.js';
import { createAccessKey } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import {
  exitWithError,
  getSuccessNextActions,
  printNextActions,
} from '../../utils/exit.js';

const context = msg('access-keys', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format', 'f', 'F'], 'table');

  const name = getOption<string>(options, ['name']);

  if (!name) {
    printFailure(context, 'Access key name is required');
    exitWithError('Access key name is required', context);
  }

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Access keys can only be created when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    exitWithError(
      'Access keys can only be created when logged in via OAuth.\nRun "tigris login oauth" first.',
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

  const { data, error } = await createAccessKey(name, {
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
    const nextActions = getSuccessNextActions(context, {
      name: data.name,
      id: data.id,
    });
    const output: Record<string, unknown> = {
      action: 'created',
      name: data.name,
      id: data.id,
      secret: data.secret,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  } else {
    console.log(`  Name: ${data.name}`);
    console.log(`  Access Key ID: ${data.id}`);
    console.log(`  Secret Access Key: ${data.secret}`);
    console.log('');
    console.log(
      '  Save these credentials securely. The secret will not be shown again.'
    );
  }

  printSuccess(context);
  printNextActions(context, { name: data.name, id: data.id });
}
