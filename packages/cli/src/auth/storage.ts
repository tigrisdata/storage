/**
 * Secure token storage using file-based storage
 */

import { homedir } from 'os';
import { join } from 'path';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { chmod } from 'fs/promises';
import type { TokenSet, OrganizationInfo } from './types.js';

const CONFIG_DIR = join(homedir(), '.tigris');
const TOKEN_FILE = join(CONFIG_DIR, 'tokens.json');
const ORGS_FILE = join(CONFIG_DIR, 'organizations.json');
const SELECTED_ORG_FILE = join(CONFIG_DIR, 'selected-org');

/**
 * Ensure config directory exists with secure permissions
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Store tokens securely
 */
export async function storeTokens(tokens: TokenSet): Promise<void> {
  ensureConfigDir();
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });

  // Ensure file has restrictive permissions
  try {
    await chmod(TOKEN_FILE, 0o600);
  } catch {
    // Ignore chmod errors on Windows
  }
}

/**
 * Retrieve stored tokens
 */
export async function getTokens(): Promise<TokenSet | null> {
  if (existsSync(TOKEN_FILE)) {
    try {
      const data = readFileSync(TOKEN_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Clear stored tokens
 */
export async function clearTokens(): Promise<void> {
  if (existsSync(TOKEN_FILE)) {
    try {
      unlinkSync(TOKEN_FILE);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Store organizations list
 */
export function storeOrganizations(organizations: OrganizationInfo[]): void {
  ensureConfigDir();
  writeFileSync(ORGS_FILE, JSON.stringify(organizations, null, 2), {
    mode: 0o600,
  });
}

/**
 * Get stored organizations
 */
export function getOrganizations(): OrganizationInfo[] {
  if (existsSync(ORGS_FILE)) {
    try {
      const data = readFileSync(ORGS_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Store selected organization
 */
export function storeSelectedOrganization(orgId: string): void {
  ensureConfigDir();
  writeFileSync(SELECTED_ORG_FILE, orgId, { mode: 0o600 });
}

/**
 * Get selected organization
 */
export function getSelectedOrganization(): string | null {
  if (existsSync(SELECTED_ORG_FILE)) {
    try {
      return readFileSync(SELECTED_ORG_FILE, 'utf8').trim();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Clear all stored data
 */
export async function clearAllData(): Promise<void> {
  await clearTokens();

  const files = [ORGS_FILE, SELECTED_ORG_FILE];
  for (const file of files) {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Ignore errors
      }
    }
  }
}
