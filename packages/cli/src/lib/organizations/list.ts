import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getAuthClient } from '../../auth/client.js';
import {
  storeSelectedOrganization,
  getSelectedOrganization,
  getLoginMethod,
} from '../../auth/storage.js';
import Enquirer from 'enquirer';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../utils/messages.js';

const context = msg('orgs', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  // Check if logged in with access keys
  if (getLoginMethod() === 'credentials') {
    console.log(
      'You are logged in using an access key, which belongs to a single organization.\n' +
        'Organization listing and selection is only available with OAuth login.\n\n' +
        'Run "tigris login --oauth" to login with your Tigris account.'
    );
    return;
  }

  const format = getOption<string>(options, ['format', 'f', 'F'], 'select');

  try {
    // Get authenticated client
    const authClient = getAuthClient();

    // Ensure we have a valid access token (will refresh if needed)
    await authClient.getAccessToken();

    // Get organizations from stored claims
    const orgs = await authClient.getOrganizations();

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
        message: `${org.displayName || org.name} (${org.id})`,
        hint: org.id === currentSelection ? 'currently selected' : undefined,
      }));

      try {
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
        storeSelectedOrganization(selectedOrgId);

        const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
        printSuccess(context, {
          name: selectedOrg?.displayName || selectedOrg?.name,
        });
        return;
      } catch (error) {
        // User cancelled the prompt (Ctrl+C)
        printFailure(context, 'Selection cancelled');
        process.exit(0);
      }
    }

    // Format organizations for output
    const organizations = orgs.map((org) => ({
      id: org.id,
      name: org.name,
      displayName: org.displayName || org.name,
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
        { key: 'displayName', header: 'Display Name' },
      ]
    );

    console.log(output);
    printSuccess(context, { count: organizations.length });
  } catch (error) {
    if (error instanceof Error) {
      printFailure(context, error.message);
    } else {
      printFailure(context);
    }
    process.exit(1);
  }
}
