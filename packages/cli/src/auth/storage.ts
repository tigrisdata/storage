/**
 * Secure storage using a single config file
 */

import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { chmod } from 'fs/promises';
import type { TokenSet, OrganizationInfo } from './types.js';

const CONFIG_DIR = join(homedir(), '.tigris');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Configuration structure
 */
interface TigrisConfig {
  tokens?: TokenSet;
  organizations?: OrganizationInfo[];
  selectedOrganization?: string;
  credentials?: CredentialsConfig;
  temporaryCredentials?: CredentialsConfig;
  loginMethod?: 'oauth' | 'credentials';
}

/**
 * Credentials configuration interface
 */
export interface CredentialsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

/**
 * Ensure config directory exists with secure permissions
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read config from file
 */
function readConfig(): TigrisConfig {
  if (existsSync(CONFIG_FILE)) {
    try {
      const data = readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Write config to file
 */
async function writeConfig(config: TigrisConfig): Promise<void> {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });

  // Ensure file has restrictive permissions
  try {
    await chmod(CONFIG_FILE, 0o600);
  } catch {
    // Ignore chmod errors on Windows
  }
}

/**
 * Store tokens securely
 */
export async function storeTokens(tokens: TokenSet): Promise<void> {
  const config = readConfig();
  config.tokens = tokens;
  await writeConfig(config);
}

/**
 * Retrieve stored tokens
 */
export async function getTokens(): Promise<TokenSet | null> {
  const config = readConfig();
  return config.tokens || null;
}

/**
 * Clear stored tokens
 */
export async function clearTokens(): Promise<void> {
  const config = readConfig();
  delete config.tokens;
  await writeConfig(config);
}

/**
 * Store organizations list
 */
export async function storeOrganizations(
  organizations: OrganizationInfo[]
): Promise<void> {
  const config = readConfig();
  config.organizations = organizations;
  await writeConfig(config);
}

/**
 * Get stored organizations
 */
export function getOrganizations(): OrganizationInfo[] {
  const config = readConfig();
  return config.organizations || [];
}

/**
 * Store selected organization
 */
export async function storeSelectedOrganization(orgId: string): Promise<void> {
  const config = readConfig();
  config.selectedOrganization = orgId;
  await writeConfig(config);
}

/**
 * Get selected organization
 */
export function getSelectedOrganization(): string | null {
  const config = readConfig();
  return config.selectedOrganization || null;
}

/**
 * Get stored credentials (checks temporary first, then saved)
 */
export function getCredentials(): CredentialsConfig | null {
  const config = readConfig();
  return config.temporaryCredentials || config.credentials || null;
}

/**
 * Get only permanent/saved credentials (from configure command)
 */
export function getSavedCredentials(): CredentialsConfig | null {
  const config = readConfig();
  return config.credentials || null;
}

/**
 * Store permanent credentials (from configure command)
 */
export async function storeCredentials(
  credentials: CredentialsConfig
): Promise<void> {
  const config = readConfig();
  config.credentials = credentials;
  await writeConfig(config);
}

/**
 * Store temporary credentials (from login command)
 */
export async function storeTemporaryCredentials(
  credentials: CredentialsConfig
): Promise<void> {
  const config = readConfig();
  config.temporaryCredentials = credentials;
  await writeConfig(config);
}

/**
 * Clear temporary credentials
 */
export async function clearTemporaryCredentials(): Promise<void> {
  const config = readConfig();
  delete config.temporaryCredentials;
  await writeConfig(config);
}

/**
 * Clear saved credentials (from configure)
 */
export async function clearCredentials(): Promise<void> {
  const config = readConfig();
  delete config.credentials;
  await writeConfig(config);
}

/**
 * Store the login method used by the user
 */
export async function storeLoginMethod(
  method: 'oauth' | 'credentials'
): Promise<void> {
  const config = readConfig();
  config.loginMethod = method;
  await writeConfig(config);
}

/**
 * Get the stored login method
 */
export function getLoginMethod(): 'oauth' | 'credentials' | null {
  const config = readConfig();
  return config.loginMethod || null;
}

/**
 * Clear all stored data (except saved credentials from configure)
 */
export async function clearAllData(): Promise<void> {
  const config = readConfig();
  const savedCredentials = config.credentials;

  // Clear everything except saved credentials
  // This includes: tokens, organizations, selectedOrganization, temporaryCredentials, loginMethod
  await writeConfig({
    credentials: savedCredentials,
  });
}
