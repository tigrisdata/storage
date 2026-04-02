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
  type CredentialsConfig,
  getAwsProfileConfig,
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
  // AWS_ endpoint vars take priority
  if (process.env.AWS_ENDPOINT_URL_S3 || process.env.AWS_ENDPOINT_URL_IAM) {
    return {
      endpoint: process.env.AWS_ENDPOINT_URL_S3 || DEFAULT_STORAGE_ENDPOINT,
      iamEndpoint: process.env.AWS_ENDPOINT_URL_IAM || DEFAULT_IAM_ENDPOINT,
      mgmtEndpoint: process.env.AWS_ENDPOINT_URL_MGMT || DEFAULT_MGMT_ENDPOINT,
    };
  }

  // Fall back to TIGRIS_ vars
  return {
    endpoint: process.env.TIGRIS_STORAGE_ENDPOINT || DEFAULT_STORAGE_ENDPOINT,
    iamEndpoint: process.env.TIGRIS_IAM_ENDPOINT || DEFAULT_IAM_ENDPOINT,
    mgmtEndpoint: process.env.TIGRIS_MGMT_ENDPOINT || DEFAULT_MGMT_ENDPOINT,
  };
}

const tigrisConfig = getTigrisConfig();
const auth0Config = getAuth0Config();

// ---------------------------------------------------------------------------
// Environment credential helpers
// ---------------------------------------------------------------------------

type EnvCredentials = CredentialsConfig & { source: 'tigris' | 'aws' };

/**
 * Get credentials from environment variables.
 * AWS_ vars take priority over TIGRIS_ vars.
 * Within each family, both key and secret must be present.
 * Returns the resolved credentials along with the env var family ('aws' | 'tigris').
 */
export function getEnvCredentials(): EnvCredentials | null {
  // Check AWS_ vars first
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    const endpoint =
      process.env.AWS_ENDPOINT_URL_S3 || DEFAULT_STORAGE_ENDPOINT;
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint,
      source: 'aws',
    };
  }

  // Fall back to TIGRIS_ vars
  if (
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID &&
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY
  ) {
    const endpoint =
      process.env.TIGRIS_STORAGE_ENDPOINT || DEFAULT_STORAGE_ENDPOINT;
    return {
      accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
      endpoint,
      source: 'tigris',
    };
  }

  return null;
}

/**
 * Get non-login credentials in priority order:
 * 1. Environment variables (AWS_ACCESS_KEY_ID / TIGRIS_STORAGE_ACCESS_KEY_ID)
 * 2. Stored credentials (temporary from login, then saved from configure)
 *
 * Note: AWS profile and login method checks are handled separately.
 * Full resolution order: AWS_PROFILE → env vars → oauth → credentials login → configured
 */
export function getCredentials(): CredentialsConfig | null {
  return getEnvCredentials() || getStoredCredentials() || null;
}

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

// ---------------------------------------------------------------------------
// Auth method resolution — single source of truth for auth priority
// ---------------------------------------------------------------------------

export type AuthMethod =
  | {
      type: 'aws-profile';
      profile: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | { type: 'oauth' }
  | { type: 'credentials'; accessKeyId: string; secretAccessKey: string }
  | {
      type: 'environment';
      accessKeyId: string;
      secretAccessKey: string;
      source: 'tigris' | 'aws';
    }
  | { type: 'configured'; accessKeyId: string; secretAccessKey: string }
  | { type: 'none' };

/**
 * Resolve which auth method is active, following the same priority as getStorageConfig().
 * 1. AWS Profile  2. Env vars (AWS_ then TIGRIS_)  3. OAuth  4. Credentials login  5. Configured
 *
 * Env vars come before login methods because setting them is an explicit
 * per-session override that should win over a previously stored login.
 */
export async function resolveAuthMethod(): Promise<AuthMethod> {
  // 1. AWS profile
  if (hasAwsProfile()) {
    const profile = process.env.AWS_PROFILE || 'default';
    const resolved = await fromIni({ profile })();
    return {
      type: 'aws-profile',
      profile,
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
    };
  }

  // 2. Env vars (explicit per-session override)
  const envCreds = getEnvCredentials();
  if (envCreds) {
    return {
      type: 'environment',
      accessKeyId: envCreds.accessKeyId,
      secretAccessKey: envCreds.secretAccessKey,
      source: envCreds.source,
    };
  }

  // 3–4. Login (oauth or credentials)
  const loginMethod = getStoredLoginMethod();

  if (loginMethod === 'oauth') {
    return { type: 'oauth' };
  }

  if (loginMethod === 'credentials') {
    const stored = getStoredCredentials();
    if (stored) {
      return {
        type: 'credentials',
        accessKeyId: stored.accessKeyId,
        secretAccessKey: stored.secretAccessKey,
      };
    }
  }

  // 5. Configured credentials
  const configured = getStoredCredentials();
  if (configured) {
    return {
      type: 'configured',
      accessKeyId: configured.accessKeyId,
      secretAccessKey: configured.secretAccessKey,
    };
  }

  return { type: 'none' };
}

// ---------------------------------------------------------------------------
// Storage config
// ---------------------------------------------------------------------------

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
  const method = await resolveAuthMethod();

  switch (method.type) {
    case 'aws-profile': {
      const profileConfig = await getAwsProfileConfig(method.profile);
      return {
        accessKeyId: method.accessKeyId,
        secretAccessKey: method.secretAccessKey,
        endpoint:
          profileConfig.endpoint ||
          tigrisConfig.endpoint ||
          DEFAULT_STORAGE_ENDPOINT,
        iamEndpoint: profileConfig.iamEndpoint || tigrisConfig.iamEndpoint,
      };
    }

    case 'oauth': {
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

    case 'credentials': {
      const selectedOrg = getSelectedOrganization();
      return {
        accessKeyId: method.accessKeyId,
        secretAccessKey: method.secretAccessKey,
        endpoint: getStoredCredentials()?.endpoint || DEFAULT_STORAGE_ENDPOINT,
        organizationId: selectedOrg ?? undefined,
        iamEndpoint: tigrisConfig.iamEndpoint,
      };
    }

    case 'environment':
      return {
        accessKeyId: method.accessKeyId,
        secretAccessKey: method.secretAccessKey,
        endpoint: getEnvCredentials()?.endpoint || DEFAULT_STORAGE_ENDPOINT,
      };

    case 'configured':
      return {
        accessKeyId: method.accessKeyId,
        secretAccessKey: method.secretAccessKey,
        endpoint: getStoredCredentials()?.endpoint || DEFAULT_STORAGE_ENDPOINT,
      };

    case 'none': {
      // No valid auth method found — try auto-login in interactive terminals
      if (await triggerAutoLogin()) {
        return getStorageConfig(options);
      }
      throw new Error(
        'Not authenticated. Please run "tigris login" or "tigris configure" first.'
      );
    }
  }
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
