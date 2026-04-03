import axios from 'axios';

import { getAuth0Config, TIGRIS_CLAIMS_NAMESPACE } from './client.js';
import { getSelectedOrganization, type OrganizationInfo } from './storage.js';

export function isFlyUser(organizationId?: string): boolean {
  return !!organizationId?.startsWith('flyio_');
}

/**
 * Check if current org is Fly.io. Prints message and returns true if so.
 * @param feature - what's unavailable, e.g. "User management" or "Organization creation"
 */
export function isFlyOrganization(feature: string): boolean {
  const selectedOrg = getSelectedOrganization();
  if (isFlyUser(selectedOrg ?? undefined)) {
    console.log(
      `${feature} is not available for Fly.io organizations.\n` +
        'Your resources are managed through Fly.io.\n\n' +
        'Visit https://fly.io to manage your organization.'
    );
    return true;
  }
  return false;
}

export async function fetchOrganizationsFromUserInfo(
  accessToken: string
): Promise<OrganizationInfo[] | null> {
  try {
    const { domain } = getAuth0Config();
    const response = await axios.get(`https://${domain}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const namespaces: OrganizationInfo[] | undefined =
      response.data[TIGRIS_CLAIMS_NAMESPACE]?.ns;

    if (!Array.isArray(namespaces)) {
      return null;
    }

    return namespaces.map((ns) => ({
      id: ns.id,
      name: ns.name,
      displayName: ns.name,
    }));
  } catch {
    return null;
  }
}
