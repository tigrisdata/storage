/**
 * Auth provider
 * Resolves auth method and provides storage config + service endpoints
 */

import { fromIni } from '@aws-sdk/credential-providers';

import {
  DEFAULT_IAM_ENDPOINT,
  DEFAULT_MGMT_ENDPOINT,
  DEFAULT_STORAGE_ENDPOINT,
} from '../constants.js';
import { getAuth0Config, getAuthClient } from './client.js';
import {
  getAwsProfileConfig,
  getCredentials,
  getEnvCredentials,
  getLoginMethod as getStoredLoginMethod,
  getSelectedOrganization,
  getStoredCredentials,
  hasAwsProfile,
} from './storage.js';

export interface TigrisConfig {
  endpoint: string;
  iamEndpoint: string;
  mgmtEndpoint: string;
}

export function getTigrisConfig(): TigrisConfig {
  // If any TIGRIS_ endpoint var is set, use TIGRIS_ vars exclusively
  if (process.env.TIGRIS_STORAGE_ENDPOINT || process.env.TIGRIS_IAM_ENDPOINT) {
    return {
      endpoint: process.env.TIGRIS_STORAGE_ENDPOINT || DEFAULT_STORAGE_ENDPOINT,
      iamEndpoint: process.env.TIGRIS_IAM_ENDPOINT || DEFAULT_IAM_ENDPOINT,
      mgmtEndpoint: process.env.TIGRIS_MGMT_ENDPOINT || DEFAULT_MGMT_ENDPOINT,
    };
  }

  // Fall back to AWS_ vars
  return {
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || DEFAULT_STORAGE_ENDPOINT,
    iamEndpoint: process.env.AWS_ENDPOINT_URL_IAM || DEFAULT_IAM_ENDPOINT,
    mgmtEndpoint: process.env.AWS_ENDPOINT_URL_MGMT || DEFAULT_MGMT_ENDPOINT,
  };
}

const tigrisConfig = getTigrisConfig();
const auth0Config = getAuth0Config();

/**
 * Trigger interactive login when not authenticated and stdin is a TTY.
 * Returns true if login was triggered, false if non-interactive or already attempted.
 */
let autoLoginAttempted = false;
async function triggerAutoLogin(): Promise<boolean> {
  if (autoLoginAttempted || !process.stdin.isTTY) return false;
  autoLoginAttempted = true;
  console.log('Not authenticated. Starting login...\n');
  const { default: login } = await import('../lib/login/select.js');
  await login({});
  console.log();
  return true;
}

/**
 * Get the login method used by the user
 */
export async function getLoginMethod(): Promise<
  'oauth' | 'credentials' | null
> {
  return getStoredLoginMethod();
}

export type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  sessionToken?: string;
  organizationId?: string;
  iamEndpoint?: string;
  authDomain?: string;
  credentialProvider?: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
  }>;
};

export async function getStorageConfig(options?: {
  withCredentialProvider?: boolean;
}): Promise<TigrisStorageConfig> {
  // 1. AWS profile (only if AWS_PROFILE is set)
  if (hasAwsProfile()) {
    const profile = process.env.AWS_PROFILE || 'default';
    const profileConfig = await getAwsProfileConfig(profile);
    const resolved = await fromIni({ profile })();
    return {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
      endpoint:
        profileConfig.endpoint ||
        tigrisConfig.endpoint ||
        DEFAULT_STORAGE_ENDPOINT,
      iamEndpoint: profileConfig.iamEndpoint || tigrisConfig.iamEndpoint,
    };
  }

  // 2. Login (oauth or credentials)
  const loginMethod = await getLoginMethod();

  if (loginMethod === 'oauth') {
    const authClient = getAuthClient();
    const selectedOrg = getSelectedOrganization();

    if (!selectedOrg) {
      throw new Error(
        'No organization selected. Please run "tigris orgs select" first.'
      );
    }

    return {
      sessionToken: await authClient.getAccessToken(),
      accessKeyId: '',
      secretAccessKey: '',
      // Only include credentialProvider for long-running operations (uploads)
      // that need token refresh. Short-lived operations (ls, rm, head) use
      // the static sessionToken above and benefit from S3Client caching.
      ...(options?.withCredentialProvider && {
        credentialProvider: async () => ({
          accessKeyId: '',
          secretAccessKey: '',
          sessionToken: await authClient.getAccessToken(),
          expiration: new Date(Date.now() + 10 * 60 * 1000),
        }),
      }),
      endpoint: tigrisConfig.endpoint,
      organizationId: selectedOrg,
      iamEndpoint: tigrisConfig.iamEndpoint,
      authDomain: auth0Config.domain,
    };
  }

  if (loginMethod === 'credentials') {
    const loginCredentials = getStoredCredentials();
    if (loginCredentials) {
      const selectedOrg = getSelectedOrganization();
      return {
        accessKeyId: loginCredentials.accessKeyId,
        secretAccessKey: loginCredentials.secretAccessKey,
        endpoint: loginCredentials.endpoint,
        organizationId: selectedOrg ?? undefined,
        iamEndpoint: tigrisConfig.iamEndpoint,
      };
    }
  }

  // 3. Env vars
  const envCredentials = getEnvCredentials();
  if (envCredentials) {
    return {
      accessKeyId: envCredentials.accessKeyId,
      secretAccessKey: envCredentials.secretAccessKey,
      endpoint: envCredentials.endpoint,
    };
  }

  // 4. Configured credentials
  const credentials = getStoredCredentials();

  if (credentials) {
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      endpoint: credentials.endpoint,
    };
  }

  // No valid auth method found — try auto-login in interactive terminals
  if (await triggerAutoLogin()) {
    return getStorageConfig(options);
  }
  throw new Error(
    'Not authenticated. Please run "tigris login" or "tigris configure" first.'
  );
}

/**
 * Check if user is authenticated (either method)
 */
export async function isAuthenticated(): Promise<boolean> {
  return (
    hasAwsProfile() ||
    (await getLoginMethod()) !== null ||
    getEnvCredentials() !== null ||
    getStoredCredentials() !== null
  );
}

/**
 * Get storage config with organization overlay from selected org.
 */
export async function getStorageConfigWithOrg() {
  const config = await getStorageConfig();
  const selectedOrg = getSelectedOrganization();
  return {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };
}

/**
 * Require OAuth login for organization operations.
 * Returns true if NOT authenticated via OAuth (caller should return early).
 */
export function requireOAuthLogin(operation: string): boolean {
  const loginMethod = getStoredLoginMethod();
  if (loginMethod === 'oauth') return false;

  if (getCredentials()) {
    console.log(
      `You are using access key credentials, which belong to a single organization.\n` +
        `${operation} is only available with OAuth login.\n\n` +
        `Run "tigris login" to login with your Tigris account.`
    );
  } else {
    console.log(
      'Not authenticated. Please run "tigris login" to login with your Tigris account.'
    );
  }
  return true;
}
