import { listOrganizations } from '@tigrisdata/iam';
import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import {
  storeSelectedOrganization,
  getLoginMethod,
  getCredentials,
} from '../../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';
import { exitWithError, printNextActions } from '../../utils/exit.js';

const context = msg('organizations', 'select');

export default async function select(options: Record<string, unknown>) {
  printStart(context);

  // Check if logged in with OAuth (required for org selection)
  const loginMethod = getLoginMethod();
  if (loginMethod !== 'oauth') {
    // Not logged in via OAuth - check if using credentials
    if (getCredentials()) {
      console.log(
        'You are using access key credentials, which belong to a single organization.\n' +
          'Organization selection is only available with OAuth login.\n\n' +
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
    printFailure(context, 'Organization name or ID is required');
    exitWithError('Organization name or ID is required', context);
  }

  const config = await getStorageConfig();

  const { data, error } = await listOrganizations({ config });

  if (error) {
    printFailure(context, error.message);
    exitWithError(error, context);
  }

  const orgs = data?.organizations ?? [];

  // Find organization by name or ID
  const org = orgs.find((o) => o.id === name || o.name === name);

  if (!org) {
    const availableOrgs = orgs
      .map((o) => `   - ${o.name} (${o.id})`)
      .join('\n');
    printFailure(
      context,
      `Organization "${name}" not found\n\nAvailable organizations:\n${availableOrgs}`
    );
    exitWithError(`Organization "${name}" not found`, context);
  }

  // Store selected organization
  await storeSelectedOrganization(org.id);

  printSuccess(context, { name: org.name });
  printNextActions(context, { name: org.name });
}
