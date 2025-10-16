/**
 * Auth0 configuration for CLI authentication
 */
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
  return {
    domain: process.env.AUTH0_DOMAIN || 'auth-dev.tigris.dev',
    clientId: process.env.AUTH0_CLIENT_ID || 'JdJVYIyw0O1uHi5L5OJH903qaWBgd3gF',
    audience: process.env.AUTH0_AUDIENCE || 'https://tigris-api-dev',
  };
}

/**
 * Custom claims namespace for Tigris
 */
export const TIGRIS_CLAIMS_NAMESPACE = 'https://tigris';
