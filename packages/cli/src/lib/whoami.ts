import { getAuthClient } from '../auth/client.js';
import { getSelectedOrganization } from '../auth/storage.js';
import { printFailure, printAlreadyDone, msg } from '../utils/messages.js';

const context = msg('whoami');

export default async function whoami(): Promise<void> {
  try {
    const authClient = getAuthClient();

    // Check if authenticated
    const isAuth = await authClient.isAuthenticated();
    if (!isAuth) {
      printAlreadyDone(context);
      return;
    }

    // Get ID token claims
    const claims = await authClient.getIdTokenClaims();
    const organizations = await authClient.getOrganizations();
    const selectedOrg = getSelectedOrganization();

    const lines: string[] = [];
    lines.push('');
    lines.push('User Information:');
    lines.push(`   Email: ${claims.email || 'N/A'}`);
    lines.push(`   User ID: ${claims.sub}`);

    if (organizations.length > 0) {
      lines.push('');
      lines.push(`Organizations (${organizations.length}):`);
      organizations.forEach((org) => {
        const isSelected = org.id === selectedOrg;
        const marker = isSelected ? '>' : ' ';
        lines.push(`   ${marker} ${org.name} (${org.id})`);
      });

      if (selectedOrg) {
        const selected = organizations.find((o) => o.id === selectedOrg);
        if (selected) {
          lines.push('');
          lines.push(`Active: ${selected.name}`);
        }
      }
    } else {
      lines.push('');
      lines.push('Organizations: None');
    }

    lines.push('');
    console.log(lines.join('\n'));
  } catch (error) {
    if (error instanceof Error) {
      printFailure(context, error.message);
    } else {
      printFailure(context);
    }
    process.exit(1);
  }
}
