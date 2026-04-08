/**
 * Secure storage using a single config file
 */

import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';
import type { Organization } from '@tigrisdata/iam';
import { execFileSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Credentials configuration interface (public — callers use this shape)
 */
export interface CredentialsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

/**
 * Stored credential with optional organization
 */
interface StoredCredential {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  organizationId?: string;
}

/**
 * V2 configuration structure — config is nested by auth method
 */
interface TigrisConfigV2 {
  version: 2;
  activeMethod?: 'oauth' | 'credentials';
  oauth?: {
    tokens?: TokenSet;
    organizations?: Organization[];
    selectedOrganization?: string;
  };
  credentials?: {
    saved?: StoredCredential;
    temporary?: StoredCredential;
  };
}

const CONFIG_DIR = join(homedir(), '.tigris');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Exported for tests
export { CONFIG_DIR, CONFIG_FILE };

/**
 * Type guard — checks that a value is a non-null object (Record-like)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Set restrictive permissions on a file or directory.
 * On Unix: uses chmod. On Windows: uses icacls to restrict to current user only.
 */
function restrictPermissions(targetPath: string, mode: number): void {
  if (platform() === 'win32') {
    try {
      const username = process.env.USERNAME;
      if (username) {
        execFileSync(
          'icacls',
          [targetPath, '/inheritance:r', '/grant:r', `${username}:F`],
          { stdio: 'ignore' }
        );
      }
    } catch {
      console.warn(
        `Warning: Could not set restrictive permissions on ${targetPath}. It may be accessible to other users.`
      );
    }
  } else {
    try {
      chmodSync(targetPath, mode);
    } catch {
      console.warn(
        `Warning: Could not set restrictive permissions on ${targetPath}. It may be accessible to other users.`
      );
    }
  }
}

/**
 * Ensure config directory exists with secure permissions
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    restrictPermissions(CONFIG_DIR, 0o700);
  }
}

/**
 * Migrate v1 config to v2.
 * Preserves saved credentials; discards everything else (tokens, orgs, loginMethod).
 * User will need to re-login after migration.
 */
function migrateV1(raw: Record<string, unknown>): TigrisConfigV2 {
  const config: TigrisConfigV2 = { version: 2 };

  // Preserve saved credentials if they look valid
  const creds = raw['credentials'];
  if (
    isRecord(creds) &&
    typeof creds['accessKeyId'] === 'string' &&
    typeof creds['secretAccessKey'] === 'string' &&
    typeof creds['endpoint'] === 'string'
  ) {
    config.credentials = {
      saved: {
        accessKeyId: creds['accessKeyId'],
        secretAccessKey: creds['secretAccessKey'],
        endpoint: creds['endpoint'],
      },
    };
  }

  return config;
}

/**
 * Read config from file, migrating v1 → v2 if needed
 */
function readConfig(): TigrisConfigV2 {
  if (!existsSync(CONFIG_FILE)) {
    return { version: 2 };
  }

  try {
    const data = readFileSync(CONFIG_FILE, 'utf8');
    const parsed: unknown = JSON.parse(data);

    if (!isRecord(parsed)) {
      return { version: 2 };
    }

    // Already v2
    if (parsed['version'] === 2) {
      return parsed as unknown as TigrisConfigV2;
    }

    // v1 → v2 migration
    const migrated = migrateV1(parsed);
    // Write migrated config back to disk
    writeConfigSync(migrated);
    return migrated;
  } catch {
    return { version: 2 };
  }
}

/**
 * Write config to file (sync, used by migration)
 */
function writeConfigSync(config: TigrisConfigV2): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  restrictPermissions(CONFIG_FILE, 0o600);
}

/**
 * Write config to file
 */
async function writeConfig(config: TigrisConfigV2): Promise<void> {
  writeConfigSync(config);
}

// ---------------------------------------------------------------------------
// OAuth data accessors
// ---------------------------------------------------------------------------

/**
 * Store tokens securely
 */
export async function storeTokens(tokens: TokenSet): Promise<void> {
  const config = readConfig();
  if (!config.oauth) {
    config.oauth = { tokens, organizations: [] };
  } else {
    config.oauth.tokens = tokens;
  }
  await writeConfig(config);
}

/**
 * Retrieve stored tokens
 */
export async function getTokens(): Promise<TokenSet | null> {
  const config = readConfig();
  return config.oauth?.tokens ?? null;
}

/**
 * Clear stored tokens
 */
export async function clearTokens(): Promise<void> {
  const config = readConfig();
  if (config.oauth) {
    delete config.oauth.tokens;
  }
  await writeConfig(config);
}

/**
 * Store organizations list
 */
export async function storeOrganizations(
  organizations: Organization[]
): Promise<void> {
  const config = readConfig();
  if (!config.oauth) {
    config.oauth = { organizations };
  } else {
    config.oauth.organizations = organizations;
  }
  await writeConfig(config);
}

/**
 * Get stored organizations
 */
export function getOrganizations(): Organization[] {
  const config = readConfig();
  return config.oauth?.organizations ?? [];
}

// ---------------------------------------------------------------------------
// Selected organization — method-aware
// ---------------------------------------------------------------------------

/**
 * Store selected organization (branches on activeMethod)
 */
export async function storeSelectedOrganization(orgId: string): Promise<void> {
  const config = readConfig();

  if (config.activeMethod === 'credentials') {
    // Write to the active credential slot
    const slot = config.credentials?.temporary ?? config.credentials?.saved;
    if (slot) {
      slot.organizationId = orgId;
    }
  } else {
    // Default: write to oauth
    if (!config.oauth) {
      config.oauth = { organizations: [] };
    }
    config.oauth.selectedOrganization = orgId;
  }

  await writeConfig(config);
}

/**
 * Get selected organization (branches on activeMethod)
 */
export function getSelectedOrganization(): string | null {
  const config = readConfig();

  if (config.activeMethod === 'credentials') {
    const slot = config.credentials?.temporary ?? config.credentials?.saved;
    return slot?.organizationId ?? null;
  }

  return config.oauth?.selectedOrganization ?? null;
}

// ---------------------------------------------------------------------------
// Credential accessors
// ---------------------------------------------------------------------------

/**
 * Check if user explicitly requested an AWS profile via AWS_PROFILE env var
 */
export function hasAwsProfile(): boolean {
  if (!process.env.AWS_PROFILE) {
    return false;
  }
  const awsDir = join(homedir(), '.aws');
  return (
    existsSync(join(awsDir, 'credentials')) ||
    existsSync(join(awsDir, 'config'))
  );
}

export type AwsProfileConfig = {
  endpoint?: string;
  iamEndpoint?: string;
  region?: string;
};

/**
 * Read profile config from ~/.aws/config using AWS SDK
 */
export async function getAwsProfileConfig(
  profile: string
): Promise<AwsProfileConfig> {
  try {
    const { configFile } = await loadSharedConfigFiles();
    const profileConfig = configFile[profile];

    if (!profileConfig) {
      return {};
    }

    return {
      endpoint:
        profileConfig['endpoint_url_s3'] || profileConfig['endpoint_url'],
      iamEndpoint: profileConfig['endpoint_url_iam'],
      region: profileConfig['region'],
    };
  } catch {
    return {};
  }
}

/**
 * Get stored credentials only (no env vars):
 * 1. Temporary credentials (from 'tigris login')
 * 2. Saved credentials (from 'tigris configure')
 */
export function getStoredCredentials(): CredentialsConfig | null {
  const config = readConfig();
  return (
    toCredentialsConfig(config.credentials?.temporary) ||
    toCredentialsConfig(config.credentials?.saved) ||
    null
  );
}

/**
 * Store permanent credentials (from configure command)
 */
export async function storeCredentials(
  credentials: CredentialsConfig
): Promise<void> {
  const config = readConfig();
  if (!config.credentials) {
    config.credentials = {};
  }
  config.credentials.saved = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    endpoint: credentials.endpoint,
  };
  await writeConfig(config);
}

/**
 * Store temporary credentials (from login command)
 */
export async function storeTemporaryCredentials(
  credentials: CredentialsConfig
): Promise<void> {
  const config = readConfig();
  if (!config.credentials) {
    config.credentials = {};
  }
  config.credentials.temporary = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    endpoint: credentials.endpoint,
  };
  await writeConfig(config);
}

/**
 * Store the login method used by the user
 */
export async function storeLoginMethod(
  method: 'oauth' | 'credentials'
): Promise<void> {
  const config = readConfig();
  config.activeMethod = method;
  await writeConfig(config);
}

/**
 * Get the stored login method
 */
export function getLoginMethod(): 'oauth' | 'credentials' | null {
  const config = readConfig();
  return config.activeMethod ?? null;
}

/**
 * Store organizationId on the specified credential slot.
 */
export async function storeCredentialOrganization(
  orgId: string,
  target: 'saved' | 'temporary'
): Promise<void> {
  const config = readConfig();
  const slot = config.credentials?.[target];
  if (slot) {
    slot.organizationId = orgId;
    await writeConfig(config);
  }
}

/**
 * Clear temporary credentials (from login command)
 */
export async function clearTemporaryCredentials(): Promise<void> {
  const config = readConfig();
  if (config.credentials) {
    delete config.credentials.temporary;
  }
  await writeConfig(config);
}

/**
 * Clear all OAuth data (tokens, organizations, selectedOrganization).
 * Also clears activeMethod when it's 'oauth' to prevent broken state
 * where resolveAuthMethod() returns oauth but no tokens exist.
 */
export async function clearOAuthData(): Promise<void> {
  const config = readConfig();
  delete config.oauth;
  if (config.activeMethod === 'oauth') {
    delete config.activeMethod;
  }
  await writeConfig(config);
}

/**
 * Clear all stored data (except saved credentials from configure)
 */
export async function clearAllData(): Promise<void> {
  const config = readConfig();
  const savedCredentials = config.credentials?.saved;

  await writeConfig({
    version: 2,
    credentials: savedCredentials ? { saved: savedCredentials } : undefined,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert StoredCredential → CredentialsConfig (strip organizationId)
 */
function toCredentialsConfig(
  stored: StoredCredential | undefined
): CredentialsConfig | null {
  if (!stored) return null;
  return {
    accessKeyId: stored.accessKeyId,
    secretAccessKey: stored.secretAccessKey,
    endpoint: stored.endpoint,
  };
}
