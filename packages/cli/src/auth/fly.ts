import { getSelectedOrganization } from './storage.js';

/** Whether an organization id belongs to a Fly.io-managed organization. */
export function isFlyOrganizationId(orgId: string | null | undefined): boolean {
  return orgId?.startsWith('flyio_') ?? false;
}

/** The one explanation for every feature Fly.io organizations lack. */
export function flyOrganizationNotice(feature: string): string {
  return (
    `${feature} is not available for Fly.io organizations.\n` +
    'Your resources are managed through Fly.io.\n\n' +
    'Visit https://fly.io to manage your organization.'
  );
}

/**
 * Check if an org is Fly.io. Prints message and returns true if so.
 * @param feature - what's unavailable, e.g. "User management" or "Organization creation"
 * @param orgId - the organization to check; the selected one by default
 */
export function isFlyOrganization(
  feature: string,
  orgId: string | null = getSelectedOrganization()
): boolean {
  if (isFlyOrganizationId(orgId)) {
    console.log(flyOrganizationNotice(feature));
    return true;
  }
  return false;
}
