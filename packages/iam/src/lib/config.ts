import { isNode, loadEnv } from '@shared/index';
import type { TigrisIAMConfig } from './types';

export const DEFAULT_ENDPOINTS = {
  iam: 'https://iam.storageapi.dev',
  mgmt: 'https://mgmt.storageapi.dev',
};

function loadIAMConfig(): TigrisIAMConfig {
  loadEnv();

  const config: TigrisIAMConfig = {
    iamEndpoint: DEFAULT_ENDPOINTS.iam,
    mgmtEndpoint: DEFAULT_ENDPOINTS.mgmt,
  };

  if (isNode()) {
    config.iamEndpoint = process.env.TIGRIS_IAM_ENDPOINT;
    config.mgmtEndpoint = process.env.TIGRIS_MGMT_ENDPOINT;
    config.sessionToken = process.env.TIGRIS_SESSION_TOKEN;
    config.organizationId = process.env.TIGRIS_ORGANIZATION_ID;
  }

  return config;
}

export const config: TigrisIAMConfig = loadIAMConfig();
