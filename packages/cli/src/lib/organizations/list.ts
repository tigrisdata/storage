import { listOrganizations } from '@tigrisdata/iam';
import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import {
  storeSelectedOrganization,
  getSelectedOrganization,
  getLoginMethod,
  getCredentials,
} from '../../auth/storage.js';
import Enquirer from 'enquirer';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../utils/messages.js';

const context = msg('organizations', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  // Check if logged in with OAuth (required for org listing)
  const loginMethod = getLoginMethod();
  if (loginMethod !== 'oauth') {
    // Not logged in via OAuth - check if using credentials
    if (getCredentials()) {
      console.log(
        'You are using access key credentials, which belong to a single organization.\n' +
          'Organization listing and selection is only available with OAuth login.\n\n' +
          'Run "tigris login" to login with your Tigris account.'
      );
    } else {
      console.log(
        'Not authenticated. Please run "tigris login" to login with your Tigris account.'
      );
    }
    return;
  }

  const format = getOption<string>(options, ['format', 'f', 'F'], 'select');

  const config = await getStorageConfig();

  const { data, error } = await listOrganizations({ config });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  const orgs = data?.organizations ?? [];

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
