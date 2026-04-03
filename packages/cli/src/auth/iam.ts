/**
 * Shared IAM auth helpers
 * Uses resolveAuthMethod() as the single source of truth for auth priority.
 */

import { failWithError } from '@utils/exit.js';
import type { MessageContext } from '@utils/messages.js';

import { getAuthClient } from './client.js';
export { isFlyOrganization } from './fly.js';
import { getTigrisConfig, resolveAuthMethod } from './provider.js';
import { getLoginMethod, getSelectedOrganization } from './storage.js';

/**
 * OAuth-only IAM config. Exits on non-OAuth or unauthenticated.
 * Used by IAM policy and user commands.
 *
 * Checks the *stored* login method (not resolveAuthMethod) because these
 * operations always require OAuth — even when env vars or AWS profile
 * are set for S3.
 */
export async function getOAuthIAMConfig(context: MessageContext) {
  if (getLoginMethod() !== 'oauth') {
    failWithError(
      context,
      'This operation requires OAuth login.\nRun "tigris login oauth" first.'
    );
  }

  const authClient = getAuthClient();
  if (!(await authClient.isAuthenticated())) {
    failWithError(
      context,
      'Not authenticated. Run "tigris login oauth" first.'
    );
  }

  const selectedOrg = getSelectedOrganization();
  const { iamEndpoint, mgmtEndpoint } = getTigrisConfig();

  return {
    sessionToken: await authClient.getAccessToken(),
    organizationId: selectedOrg ?? undefined,
    iamEndpoint,
    mgmtEndpoint,
  };
}

/**
 * Dual-mode IAM config (OAuth or credentials).
 * Uses resolveAuthMethod() to follow the same priority as getStorageConfig().
 * Used by access-key commands.
 */
export async function getIAMConfig(context: MessageContext) {
  const method = await resolveAuthMethod();

  switch (method.type) {
    case 'oauth':
      return getOAuthIAMConfig(context);

    case 'aws-profile':
    case 'credentials':
    case 'environment':
    case 'configured':
      return {
        accessKeyId: method.accessKeyId,
        secretAccessKey: method.secretAccessKey,
        organizationId: getSelectedOrganization() ?? undefined,
        iamEndpoint: getTigrisConfig().iamEndpoint,
      };

    case 'none':
      failWithError(
        context,
        'Not authenticated. Run "tigris login" or "tigris configure" first.'
      );
  }
}
