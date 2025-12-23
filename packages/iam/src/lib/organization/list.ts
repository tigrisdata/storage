import { createIAMClient } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export type ListOrganizationsResponse = {
  organizations: Organization[];
};

export type ListOrganizationsOptions = {
  config?: TigrisIAMConfig;
};

type IAMNamespacesResponse = {
  status: string;
  result: Organization[];
};

export async function listOrganizations(
  options?: ListOrganizationsOptions
): Promise<TigrisIAMResponse<ListOrganizationsResponse, Error>> {
  if (!options?.config?.sessionToken || options.config.sessionToken === '') {
    return { error: new Error('Session token is required') };
  }

  const { data: client, error } = createIAMClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const response = await client.request<unknown, IAMNamespacesResponse>({
    method: 'GET',
    path: `/tigris-iam/namespaces`,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${options.config.sessionToken}`,
    },
  });

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: { organizations: response.data.result ?? [] },
  };
}
