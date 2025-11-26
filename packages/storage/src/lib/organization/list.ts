import { createTigrisHttpClient } from '../tigris-client';
import { TigrisStorageConfig, TigrisStorageResponse } from '../types';

const TIGRIS_CLAIMS_NAMESPACE = 'https://tigris';

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export type ListOrganizationsResponse = {
  organizations: Organization[];
};

export type ListOrganizationsOptions = {
  limit?: number;
  config?: TigrisStorageConfig;
};

type UserInfoResponse = {
  [TIGRIS_CLAIMS_NAMESPACE]: {
    ns: Organization[];
  };
};

export async function listOrganizations(
  options?: ListOrganizationsOptions
): Promise<TigrisStorageResponse<ListOrganizationsResponse, Error>> {
  const { data: tigrisHttpClient, error } = createTigrisHttpClient(
    options?.config,
    true
  );

  if (error || !tigrisHttpClient) {
    return { error };
  }

  const response = await tigrisHttpClient.request<unknown, UserInfoResponse>(
    {
      method: 'GET',
      path: `/userinfo`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options?.config?.sessionToken}`,
      },
    },
    'auth0'
  );

  return {
    data: {
      organizations: response.data[TIGRIS_CLAIMS_NAMESPACE]?.ns ?? [],
    },
  };
}
