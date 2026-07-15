import { getAuthClient } from '@auth/client.js';
import { getStorageConfig, requireOAuthLogin } from '@auth/provider.js';
import {
  getSelectedOrganization,
  storeSelectedOrganization,
} from '@auth/storage.js';
import { listOrganizations, type Organization } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { requireInteractive } from '@utils/interactive.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';
import Enquirer from 'enquirer';

const context = msg('organizations', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  if (requireOAuthLogin('Organization listing and selection')) return;

  const format = getFormat(options, 'select');

  const authClient = getAuthClient();

  let orgs: Organization[];

  if (await authClient.isFlyUser()) {
    orgs = (await authClient.fetchOrganizationsFromUserInfo()) ?? [];
  } else {
    const config = await getStorageConfig();
    const { data, error } = await listOrganizations({ config });

    if (error) {
      failWithError(context, error);
    }

    orgs = data?.organizations ?? [];
  }

  if (orgs.length === 0) {
    printEmpty(context);
    return;
  }

  // Get currently selected organization
  const currentSelection = getSelectedOrganization();

  // If select flag is provided, show interactive selection
  if (format === 'select') {
    const choices = orgs.map((org) => ({
      name: org.id,
      message: `${org.name} (${org.id})`,
      hint: org.id === currentSelection ? 'currently selected' : undefined,
    }));

    requireInteractive('Use --format table or --format json');

    const response = await Enquirer.prompt<{ organization: string }>({
      type: 'select',
      name: 'organization',
      message: 'Select an organization:',
      choices: choices.map((c) => c.message),
      initial: currentSelection
        ? orgs.findIndex((o) => o.id === currentSelection)
        : 0,
    });

    const answer = response.organization;

    // Extract the org ID from the selection (format: "Name (id)")
    const match = answer.match(/\(([^)]+)\)$/);
    const selectedOrgId = match ? match[1] : orgs[0].id;

    // Store the selection
    await storeSelectedOrganization(selectedOrgId);

    const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
    printSuccess(context, {
      name: selectedOrg?.name,
    });
    return;
  }

  // Format organizations for output
  const organizations = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    selected: org.id === currentSelection ? '*' : '',
  }));

  const output = formatOutput(
    organizations,
    format!,
    'organizations',
    'organization',
    [
      { key: 'selected', header: ' ', width: 1 },
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      { key: 'slug', header: 'Slug' },
    ]
  );

  console.log(output);
  printSuccess(context, { count: organizations.length });
}
