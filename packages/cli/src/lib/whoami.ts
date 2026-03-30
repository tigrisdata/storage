import { getAuthClient } from '@auth/client.js';
import { getStorageConfig } from '@auth/provider.js';
import {
  getCredentials,
  getLoginMethod,
  getSelectedOrganization,
} from '@auth/storage.js';
import { listOrganizations } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printAlreadyDone } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('whoami');

export default async function whoami(
  options: Record<string, unknown> = {}
): Promise<void> {
  try {
    const format = getFormat(options);
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
    let organizations: { id: string; name: string }[] = [];
    let selectedOrg: string | null | undefined;

    if (loginMethod === 'oauth') {
      const config = await getStorageConfig();
      selectedOrg = getSelectedOrganization();
      const { data, error } = await listOrganizations({ config });

      if (error) {
        failWithError(context, error);
      }

      organizations = data?.organizations ?? [];

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

    if (format === 'json') {
      const result: Record<string, unknown> = { email, userId, loginMethod };
      if (loginMethod === 'oauth') {
        result.organizations = organizations.map((org) => ({
          id: org.id,
          name: org.name,
        }));
        if (selectedOrg) {
          const selected = organizations.find((o) => o.id === selectedOrg);
          if (selected) result.activeOrganization = selected.name;
        }
      }
      console.log(JSON.stringify(result));
      return;
    }

    lines.push('');
    console.log(lines.join('\n'));
  } catch (error) {
    failWithError(context, error);
  }
}
