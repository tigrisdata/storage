import {
  isNode,
  loadEnv,
  missingConfigError as baseMissingConfigError,
} from '@shared/index';
import type { TigrisIAMConfig } from './types';

const configMap: Record<keyof TigrisIAMConfig, string> = {
  iamEndpoint: 'TIGRIS_IAM_ENDPOINT',
  sessionToken: 'TIGRIS_SESSION_TOKEN',
  organizationId: 'TIGRIS_ORGANIZATION_ID',
};

export const missingConfigError = (key: string) =>
  baseMissingConfigError(key, configMap[key as keyof TigrisIAMConfig]);

function loadIAMConfig(): TigrisIAMConfig {
  loadEnv();

  const config: TigrisIAMConfig = {
    iamEndpoint: 'https://iam.storageapi.dev',
  };

  if (isNode()) {
    config.iamEndpoint =
      process.env.TIGRIS_IAM_ENDPOINT ?? 'https://iam.storageapi.dev';
    config.sessionToken = process.env.TIGRIS_SESSION_TOKEN;
    config.organizationId = process.env.TIGRIS_ORGANIZATION_ID;
  }

  return config;
}

export const config: TigrisIAMConfig = loadIAMConfig();
