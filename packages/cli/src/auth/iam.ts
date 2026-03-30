/**
 * Shared IAM auth helpers
 * Consolidates OAuth check + auth check + config building patterns
 */

import { failWithError } from '@utils/exit.js';
import type { MessageContext } from '@utils/messages.js';

import { getAuthClient } from './client.js';
import { isFlyUser } from './fly.js';
import { getLoginMethod, getTigrisConfig } from './provider.js';
import { getCredentials, getSelectedOrganization } from './storage.js';

/**
 * Check if current org is Fly.io. Prints message and returns true if so.
 */
export function isFlyOrganization(): boolean {
  const selectedOrg = getSelectedOrganization();
  if (isFlyUser(selectedOrg ?? undefined)) {
    console.log(
      'User management is not available for Fly.io organizations.\n' +
        'Your users are managed through Fly.io.\n\n' +
        'Visit https://fly.io to manage your organization members.'
    );
    return true;
  }
  return false;
}

/**
 * OAuth-only IAM config. Exits on non-OAuth or unauthenticated.
 * Used by IAM policy and user commands.
 */
export async function getOAuthIAMConfig(context: MessageContext) {
  const loginMethod = await getLoginMethod();
  if (loginMethod !== 'oauth') {
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

  const accessToken = await authClient.getAccessToken();
  const selectedOrg = getSelectedOrganization();
  const { iamEndpoint, mgmtEndpoint } = getTigrisConfig();

  return {
    sessionToken: accessToken,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint,
    mgmtEndpoint,
  };
}

/**
 * Dual-mode IAM config (OAuth or credentials).
 * Used by access-key commands.
 */
export async function getIAMConfig(context: MessageContext) {
  const loginMethod = await getLoginMethod();
  const tigrisConfig = getTigrisConfig();
  const selectedOrg = getSelectedOrganization();

  if (loginMethod === 'oauth') {
    const authClient = getAuthClient();
    if (!(await authClient.isAuthenticated())) {
      failWithError(
        context,
        'Not authenticated. Run "tigris login oauth" first.'
      );
    }

    return {
      sessionToken: await authClient.getAccessToken(),
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
    };
  }

  const credentials = getCredentials();
  if (!credentials) {
    failWithError(
      context,
      'Not authenticated. Run "tigris login" or "tigris configure" first.'
    );
  }

  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint: tigrisConfig.iamEndpoint,
  };
}
