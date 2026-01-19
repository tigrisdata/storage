import { createOrganization } from '@tigrisdata/iam';
import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getLoginMethod, getCredentials } from '../../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  printHint,
  msg,
} from '../../utils/messages.js';

const context = msg('organizations', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  // Check if logged in with OAuth (required for org creation)
  const loginMethod = getLoginMethod();
  if (loginMethod !== 'oauth') {
    // Not logged in via OAuth - check if using credentials
    if (getCredentials()) {
      console.log(
        'You are using access key credentials, which belong to a single organization.\n' +
          'Organization creation is only available with OAuth login.\n\n' +
          'Run "tigris login" to login with your Tigris account.'
      );
    } else {
      console.log(
        'Not authenticated. Please run "tigris login" to login with your Tigris account.'
      );
    }
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

  const id = data.id;

  printSuccess(context, { name, id });
  printHint(context, { name });
}
