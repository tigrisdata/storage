import { createTigrisHttpClient, type TigrisHttpClient } from '@shared/index';
import { config } from './config';
import type { TigrisIAMConfig, TigrisIAMResponse } from './types';

function getIAMEndpoint(options?: TigrisIAMConfig): string {
  return (
    options?.iamEndpoint ?? config.iamEndpoint ?? 'https://iam.storageapi.dev'
  );
}

export function createIAMClient(
  options?: TigrisIAMConfig
): TigrisIAMResponse<TigrisHttpClient, Error> {
  const sessionToken = options?.sessionToken ?? config.sessionToken;
  const organizationId = options?.organizationId ?? config.organizationId;

  return createTigrisHttpClient({
    baseUrl: getIAMEndpoint(options),
    sessionToken,
    organizationId,
  });
}
