import { getStorageConfig, requireOAuthLogin } from '@auth/provider.js';
import { storeSelectedOrganization } from '@auth/storage.js';
import { listOrganizations } from '@tigrisdata/iam';
import { exitWithError, failWithError, printNextActions } from '@utils/exit.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('organizations', 'select');

export default async function select(options: Record<string, unknown>) {
  printStart(context);

  if (requireOAuthLogin('Organization selection')) return;

  const format = getFormat(options);

  const name = getOption<string>(options, ['name', 'N']);

  if (!name) {
    failWithError(context, 'Organization name or ID is required');
  }

  const config = await getStorageConfig();

  const { data, error } = await listOrganizations({ config });

  if (error) {
    failWithError(context, error);
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

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'selected', organization: org.name }));
  }

  printSuccess(context, { name: org.name });
  printNextActions(context, { name: org.name });
}
