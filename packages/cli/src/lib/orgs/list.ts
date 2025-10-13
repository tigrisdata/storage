import { getOption } from '../../utils/options.js';
import { formatOutput } from '../../utils/format.js';
import { getAuthClient } from '../../auth/client.js';
import {
  storeSelectedOrganization,
  getSelectedOrganization,
} from '../../auth/storage.js';
import Enquirer from 'enquirer';

export default async function list(options: Record<string, unknown>) {
  console.log('📋 Listing Organizations');

  const format = getOption<string>(options, ['format', 'f', 'F'], 'select');

  try {
    // Get authenticated client
    const authClient = getAuthClient();

    // Ensure we have a valid access token (will refresh if needed)
    await authClient.getAccessToken();

    // Get organizations from stored claims
    const orgs = await authClient.getOrganizations();

    if (orgs.length === 0) {
      console.log(
        '\n⚠️  No organizations found. You may need to re-authenticate.'
      );
      console.log('   Run: tigris login\n');
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
        console.log(
          `\n✅ Selected organization: ${selectedOrg?.displayName || selectedOrg?.name} (${selectedOrgId})\n`
        );
        return;
      } catch (error) {
        // User cancelled the prompt (Ctrl+C)
        console.log('\n❌ Selection cancelled\n');
        process.exit(0);
      }
    }

    // Format organizations for output
    const organizations = orgs.map((org) => ({
      id: org.id,
      name: org.name,
      displayName: org.displayName || org.name,
      selected: org.id === currentSelection ? '✓' : '',
    }));

    const output = formatOutput(
      organizations,
      format!,
      'organizations',
      'organization',
      [
        { key: 'selected', header: '', width: 3 },
        { key: 'id', header: 'ID', width: 20 },
        { key: 'name', header: 'Name', width: 20 },
        { key: 'displayName', header: 'Display Name', width: 30 },
      ]
    );

    console.log(output);
    console.log(`\nFound ${organizations.length} organization(s)`);

    if (currentSelection) {
      const selected = orgs.find((o) => o.id === currentSelection);
      console.log(
        `Currently selected: ${selected?.displayName || selected?.name} (${currentSelection})`
      );
    } else {
      console.log('No organization selected.');
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ ${error.message}\n`);
    } else {
      console.error('\n❌ Failed to list organizations\n');
    }
    process.exit(1);
  }
}
