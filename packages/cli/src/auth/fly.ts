import { getSelectedOrganization } from './storage.js';

/**
 * Check if current org is Fly.io. Prints message and returns true if so.
 * @param feature - what's unavailable, e.g. "User management" or "Organization creation"
 */
export function isFlyOrganization(feature: string): boolean {
  const selectedOrg = getSelectedOrganization();
  if (selectedOrg?.startsWith('flyio_')) {
    console.log(
      `${feature} is not available for Fly.io organizations.\n` +
        'Your resources are managed through Fly.io.\n\n' +
        'Visit https://fly.io to manage your organization.'
    );
    return true;
  }
  return false;
}
