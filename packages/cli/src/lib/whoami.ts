import { getAuthClient } from '@auth/client.js';
import { getTigrisConfig, resolveAuthMethod } from '@auth/provider.js';
import { getSelectedOrganization } from '@auth/storage.js';
import { whoami as iamWhoami } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printAlreadyDone } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('whoami');

/** Auth method label displayed to the user */
const AUTH_LABELS: Record<string, string> = {
  'aws-profile': 'AWS Profile',
  oauth: 'OAuth',
  credentials: 'Access Key Credentials',
  environment: 'Environment Variables',
  configured: 'Configured Credentials',
};

/**
 * Call IAM whoami with the given key pair (best-effort).
 * Returns userId + organizationId on success, undefined fields on failure.
 */
async function fetchIamIdentity(accessKeyId: string, secretAccessKey: string) {
  try {
    const tigrisConfig = getTigrisConfig();
    const { data } = await iamWhoami({
      config: {
        accessKeyId,
        secretAccessKey,
        iamEndpoint: tigrisConfig.iamEndpoint,
      },
    });
    return { userId: data?.userId, organizationId: data?.organizationId };
  } catch {
    return { userId: undefined, organizationId: undefined };
  }
}

export default async function whoami(
  options: Record<string, unknown> = {}
): Promise<void> {
  try {
    const format = getFormat(options);
    const method = await resolveAuthMethod();

    if (method.type === 'none') {
      printAlreadyDone(context);
      return;
    }

    let email: string | undefined;
    let userId: string | undefined;
    let organizationId: string | undefined;
    let organizations: { id: string; name: string }[] | undefined;
    let selectedOrg: string | null | undefined;

    const lines: string[] = [''];
    const label = AUTH_LABELS[method.type] ?? method.type;

    switch (method.type) {
      case 'aws-profile': {
        lines.push(`Auth method: ${label} (${method.profile})`);
        const iam = await fetchIamIdentity(
          method.accessKeyId,
          method.secretAccessKey
        );
        userId = iam.userId;
        organizationId = iam.organizationId;
        break;
      }

      case 'oauth': {
        lines.push(`Auth method: ${label}`);
        const authClient = getAuthClient();
        const isAuthenticated = await authClient.isAuthenticated();
        if (!isAuthenticated) {
          printAlreadyDone(context);
          return;
        }
        const claims = await authClient.getIdTokenClaims();
        email = claims.email;
        userId = claims.sub;

        selectedOrg = getSelectedOrganization();
        organizations = await authClient.getOrganizations();
        break;
      }

      case 'credentials': {
        lines.push(`Auth method: ${label}`);
        const iam = await fetchIamIdentity(
          method.accessKeyId,
          method.secretAccessKey
        );
        userId = iam.userId;
        organizationId = iam.organizationId;
        break;
      }

      case 'environment': {
        const envLabel =
          method.source === 'tigris' ? 'TIGRIS_STORAGE_*' : 'AWS_*';
        lines.push(`Auth method: ${label} (${envLabel})`);
        const iam = await fetchIamIdentity(
          method.accessKeyId,
          method.secretAccessKey
        );
        userId = iam.userId;
        organizationId = iam.organizationId;
        break;
      }

      case 'configured': {
        lines.push(`Auth method: ${label}`);
        const iam = await fetchIamIdentity(
          method.accessKeyId,
          method.secretAccessKey
        );
        userId = iam.userId;
        organizationId = iam.organizationId;
        break;
      }
    }

    // User info
    lines.push('');
    lines.push('User Information:');
    lines.push(`   Email: ${email || 'N/A'}`);
    lines.push(`   User ID: ${userId || 'N/A'}`);

    // Organization display
    if (organizations) {
      // OAuth path — list all orgs
      if (organizations.length > 0) {
        const maxVisible = 5;
        const visible = organizations.slice(0, maxVisible);

        lines.push('');
        lines.push(`Organizations (${organizations.length}):`);
        visible.forEach((org) => {
          const isSelected = org.id === selectedOrg;
          const marker = isSelected ? '>' : ' ';
          lines.push(`   ${marker} ${org.name} (${org.id})`);
        });

        if (organizations.length > maxVisible) {
          lines.push(
            `   ... and ${organizations.length - maxVisible} more. Run "tigris organizations list" to see all.`
          );
        }

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
    } else if (organizationId) {
      lines.push(`   Organization: ${organizationId}`);
    }

    if (format === 'json') {
      const result: Record<string, unknown> = {
        authMethod: method.type,
        email,
        userId,
      };
      if (organizations) {
        result.organizations = organizations.map((org) => ({
          id: org.id,
          name: org.name,
        }));
        if (selectedOrg) {
          const selected = organizations.find((o) => o.id === selectedOrg);
          if (selected) result.activeOrganization = selected.name;
        }
      }
      if (organizationId) {
        result.organizationId = organizationId;
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
