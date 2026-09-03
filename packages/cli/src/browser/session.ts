/**
 * Installing credentials into the CLI's own credential store.
 *
 * The browser build cannot run the CLI's device-flow login — Auth0's
 * `/oauth/device/code` sends no CORS headers — so the host performs login (via
 * Auth0's SPA SDK) and hands the result here. Everything downstream then works
 * unmodified: `getStorageConfig()` resolves it, `whoami` reports it, `logout`
 * clears it, and token refresh goes through the CLI's existing client.
 *
 * The store writes to `~/.tigris/config.json` on the in-memory volume, so
 * nothing survives a page reload.
 */

import type { Organization } from '@tigrisdata/iam';
import {
  getStorageConfig,
  type TigrisStorageConfig,
} from '../auth/provider.js';
import {
  clearAllData,
  getLoginMethod,
  getSelectedOrganization,
  getTokens,
  storeCredentialOrganization,
  storeLoginMethod,
  storeOrganizations,
  storeSelectedOrganization,
  storeTemporaryCredentials,
  storeTokens,
} from '../auth/storage.js';
import { DEFAULT_STORAGE_ENDPOINT } from '../constants.js';

export type { TigrisStorageConfig };

export interface OAuthSession {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Unix ms. Defaults to one hour out when the provider does not say. */
  expiresAt?: number;
  organizations?: Organization[];
  /** Organization id to make active. Defaults to the first one. */
  selectedOrganization?: string;
}

export interface AccessKeySession {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  organizationId?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Install an OAuth session obtained by the host. */
export async function setOAuthSession(session: OAuthSession): Promise<void> {
  await storeTokens({
    accessToken: session.accessToken,
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    ...(session.idToken ? { idToken: session.idToken } : {}),
    expiresAt: session.expiresAt ?? Date.now() + ONE_HOUR_MS,
  });

  await storeLoginMethod('oauth');

  const organizations = session.organizations ?? [];
  if (organizations.length > 0) {
    await storeOrganizations(organizations);

    const selected = session.selectedOrganization ?? organizations[0]?.id;
    if (selected) await storeSelectedOrganization(selected);
  }
}

export interface RenewedTokens {
  accessToken: string;
  /** Kept from the current session when the refresh response carries none. */
  idToken?: string;
  /** Unix ms. Defaults to one hour out when the provider does not say. */
  expiresAt?: number;
}

/**
 * Replace the access token of the current OAuth session, keeping everything
 * else. A refresh response does not always carry an ID token, and `whoami`
 * reads the user's identity out of the stored one — installing the refreshed
 * set with `setOAuthSession` would wipe it.
 *
 * @throws if there is no OAuth session to renew.
 */
export async function renewOAuthSession(tokens: RenewedTokens): Promise<void> {
  const current = await getTokens();
  if (!current || getLoginMethod() !== 'oauth') {
    throw new Error(
      'Not authenticated. Please run "tigris login" to authenticate.'
    );
  }

  await storeTokens({
    ...current,
    accessToken: tokens.accessToken,
    ...(tokens.idToken ? { idToken: tokens.idToken } : {}),
    expiresAt: tokens.expiresAt ?? Date.now() + ONE_HOUR_MS,
  });
}

/**
 * Install access-key credentials. Stored as *temporary* credentials — the same
 * slot `tigris login credentials` uses, which `logout` clears.
 */
export async function setAccessKeySession(
  session: AccessKeySession
): Promise<void> {
  await storeTemporaryCredentials({
    accessKeyId: session.accessKeyId,
    secretAccessKey: session.secretAccessKey,
    endpoint: session.endpoint ?? DEFAULT_STORAGE_ENDPOINT,
  });

  await storeLoginMethod('credentials');

  if (session.organizationId) {
    await storeCredentialOrganization(session.organizationId, 'temporary');
  }
}

/** Forget everything. Equivalent to `tigris logout`. */
export async function clearSession(): Promise<void> {
  await clearAllData();
}

/**
 * The resolved storage config for the active session — the same object every
 * CLI handler passes to the SDK. Exposed so a host can mount buckets or make
 * SDK calls of its own without re-deriving credentials.
 *
 * @throws if nothing is authenticated.
 */
export async function getSessionConfig(): Promise<TigrisStorageConfig> {
  return getStorageConfig();
}

export interface SessionState {
  method: 'oauth' | 'credentials' | null;
  organizationId: string | null;
}

export function getSessionState(): SessionState {
  return {
    method: getLoginMethod(),
    organizationId: getSelectedOrganization(),
  };
}
