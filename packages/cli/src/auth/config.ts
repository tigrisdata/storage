import {
  DEFAULT_STORAGE_ENDPOINT,
  DEFAULT_IAM_ENDPOINT,
} from '../constants.js';

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
  const isDev = process.env.TIGRIS_ENV === 'development';
  const domain =
    process.env.AUTH0_DOMAIN || isDev
      ? 'auth-dev.tigris.dev'
      : 'auth.tigris.dev';
  const clientId =
    process.env.AUTH0_CLIENT_ID || isDev
      ? 'JdJVYIyw0O1uHi5L5OJH903qaWBgd3gF'
      : 'DMejqeM3CQ4IqTjEcd3oA9eEiT40hn8D';
  const audience =
    process.env.AUTH0_AUDIENCE || isDev
      ? 'https://tigris-api-dev'
      : 'https://tigris-os-api';

  return {
    domain,
    clientId,
    audience,
  };
}

/**
 * Custom claims namespace for Tigris
 */
export const TIGRIS_CLAIMS_NAMESPACE =
  process.env.TIGRIS_CLAIMS_NAMESPACE || 'https://tigris';

export function getTigrisConfig(): TigrisConfig {
  // If any TIGRIS_ endpoint var is set, use TIGRIS_ vars exclusively
  if (process.env.TIGRIS_STORAGE_ENDPOINT || process.env.TIGRIS_IAM_ENDPOINT) {
    return {
      endpoint: process.env.TIGRIS_STORAGE_ENDPOINT || DEFAULT_STORAGE_ENDPOINT,
      iamEndpoint: process.env.TIGRIS_IAM_ENDPOINT || DEFAULT_IAM_ENDPOINT,
    };
  }

  // Fall back to AWS_ vars
  return {
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || DEFAULT_STORAGE_ENDPOINT,
    iamEndpoint: process.env.AWS_ENDPOINT_URL_IAM || DEFAULT_IAM_ENDPOINT,
  };
}
