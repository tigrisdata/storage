import { createOrganization } from '@tigrisdata/storage';
import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getAuthClient } from '../../auth/client.js';
import { getLoginMethod } from '../../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  printHint,
  msg,
} from '../../utils/messages.js';

const context = msg('orgs', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  // Check if logged in with access keys
  if (getLoginMethod() === 'credentials') {
    console.log(
      'You are logged in using an access key, which belongs to a single organization.\n' +
        'Organization creation is only available with OAuth login.\n\n' +
        'Run "tigris login --oauth" to login with your Tigris account.'
    );
    return;
  }

  const name = getOption<string>(options, ['name', 'N']);

  if (!name) {
    printFailure(context, 'Organization name is required');
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { data, error } = await createOrganization(name, { config });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  const authClient = getAuthClient();
  const tokens = await authClient.refreshAccessToken();

  if (tokens.idToken) {
    await authClient.extractAndStoreOrganizations(tokens.idToken);
  }

  const orgId = data.id;

  printSuccess(context, { name, id: orgId });
  printHint(context, { name });
}
