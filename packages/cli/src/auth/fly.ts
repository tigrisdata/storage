import axios from 'axios';
import type { OrganizationInfo } from './types.js';
import { getAuth0Config, TIGRIS_CLAIMS_NAMESPACE } from './config.js';

export function isFlyUser(organizationId?: string): boolean {
  return !!organizationId?.startsWith('flyio_');
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
