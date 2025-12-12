/**
 * Auth0 configuration for CLI authentication
 */
export interface Auth0Config {
  domain: string;
  clientId: string;
  audience: string;
}

export interface TigrisConfig {
  endpoint: string;
  iamEndpoint: string;
}

/**
 * Get Auth0 configuration from environment variables or defaults
 * In production, these should come from environment variables
 */
export function getAuth0Config(): Auth0Config {
  return {
    domain: process.env.AUTH0_DOMAIN || 'auth.tigris.dev',
    clientId: process.env.AUTH0_CLIENT_ID || 'DMejqeM3CQ4IqTjEcd3oA9eEiT40hn8D',
    audience: process.env.AUTH0_AUDIENCE || 'https://tigris-os-api',
  };
}

/**
 * Custom claims namespace for Tigris
 */
export const TIGRIS_CLAIMS_NAMESPACE =
  process.env.TIGRIS_CLAIMS_NAMESPACE || 'https://tigris';

export function getTigrisConfig(): TigrisConfig {
  return {
    endpoint: process.env.TIGRIS_STORAGE_ENDPOINT || 'https://t3.storage.dev',
    iamEndpoint:
      process.env.TIGRIS_STORAGE_IAM_ENDPOINT || 'https://iam.storageapi.dev',
  };
}
