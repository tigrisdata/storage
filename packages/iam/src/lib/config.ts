import { getEnvVar, isNode } from '@shared/index';
import type { TigrisIAMConfig } from './types';

export const DEFAULT_ENDPOINTS = {
  iam: 'https://iam.storageapi.dev',
  mgmt: 'https://mgmt.storageapi.dev',
};

/**
 * Resolve the Tigris IAM configuration from the environment, on demand.
 *
 * Reads only `TIGRIS_`-prefixed variables — from `process.env`, falling back to
 * a private parse of `.env` — and never mutates `process.env`. There is no
 * module-level config and importing this module has no side effects: each
 * operation calls `getConfig()` when it needs the current configuration.
 */
export function getConfig(): TigrisIAMConfig {
  const config: TigrisIAMConfig = {
    iamEndpoint: DEFAULT_ENDPOINTS.iam,
    mgmtEndpoint: DEFAULT_ENDPOINTS.mgmt,
  };

  if (isNode()) {
    config.iamEndpoint = getEnvVar('TIGRIS_IAM_ENDPOINT');
    config.mgmtEndpoint = getEnvVar('TIGRIS_MGMT_ENDPOINT');
    config.sessionToken = getEnvVar('TIGRIS_SESSION_TOKEN');
    config.organizationId = getEnvVar('TIGRIS_ORGANIZATION_ID');
    config.accessKeyId = getEnvVar('TIGRIS_STORAGE_ACCESS_KEY_ID');
    config.secretAccessKey = getEnvVar('TIGRIS_STORAGE_SECRET_ACCESS_KEY');
  }

  return config;
}
