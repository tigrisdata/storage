import { listOrganizations } from '@tigrisdata/iam';
import { getAuthClient } from '../auth/client.js';
import {
  getSelectedOrganization,
  getLoginMethod,
  getCredentials,
} from '../auth/storage.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { printFailure, printAlreadyDone, msg } from '../utils/messages.js';

const context = msg('whoami');

export default async function whoami(): Promise<void> {
  try {
    const loginMethod = getLoginMethod();
    const credentials = getCredentials();

    // Get user info based on login method
    let email: string | undefined;
    let userId: string | undefined;

    if (loginMethod === 'oauth') {
      const authClient = getAuthClient();
      // Verify OAuth tokens actually exist (handles case where tokens were cleared but loginMethod wasn't)
      const isAuthenticated = await authClient.isAuthenticated();
      if (!isAuthenticated) {
        printAlreadyDone(context);
        return;
      }
      const claims = await authClient.getIdTokenClaims();
      email = claims.email;
      userId = claims.sub;
    } else if (credentials) {
      // Using access key credentials
      email = undefined;
      userId = credentials.accessKeyId;
    } else {
      // Not authenticated
      printAlreadyDone(context);
      return;
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('User Information:');
    lines.push(`   Email: ${email || 'N/A'}`);
    lines.push(`   User ID: ${userId || 'N/A'}`);

    // Only fetch organizations for OAuth users (credentials don't have session tokens)
    if (loginMethod === 'oauth') {
      const config = await getStorageConfig();
      const selectedOrg = getSelectedOrganization();
      const { data, error } = await listOrganizations({ config });

      if (error) {
        printFailure(context, error.message);
        process.exit(1);
      }

      const organizations = data?.organizations ?? [];

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
    } else {
      lines.push('');
      lines.push('Login method: Access Key Credentials');
      lines.push(
        '   (Organization listing requires OAuth login: tigris login)'
      );
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
