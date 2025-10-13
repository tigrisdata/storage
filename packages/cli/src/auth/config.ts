/**
 * Auth0 configuration for CLI authentication
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file manually
// This is called lazily when config is first accessed
let envLoaded = false;
function ensureEnvLoaded() {
  if (!envLoaded) {
    try {
      const envPath = join(process.cwd(), '.env');
      if (existsSync(envPath)) {
        const envFile = readFileSync(envPath, 'utf8');
        const lines = envFile.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#')) {
            continue;
          }

          // Parse KEY=VALUE
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            let value = match[2].trim();

            // Remove surrounding quotes if present
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }

            // Only set if not already defined
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    } catch (error) {
      // Silently fail if .env file doesn't exist or can't be read
    }
    envLoaded = true;
  }
}

export interface Auth0Config {
  domain: string;
  clientId: string;
  audience: string;
}

/**
 * Get Auth0 configuration from environment variables or defaults
 * In production, these should come from environment variables
 */
export function getAuth0Config(): Auth0Config {
  ensureEnvLoaded();

  return {
    domain: process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com',
    clientId: process.env.AUTH0_CLIENT_ID || 'your-client-id',
    audience: process.env.AUTH0_AUDIENCE || 'https://api.tigrisdata.com',
  };
}

/**
 * Custom claims namespace for Tigris
 */
export const TIGRIS_CLAIMS_NAMESPACE = 'https://tigris';
