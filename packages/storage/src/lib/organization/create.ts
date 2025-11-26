import { randomUUID } from 'node:crypto';
import { createTigrisHttpClient } from '../tigris-client';
import { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { listOrganizations } from './list';

export interface CreateOrganizationOptions {
  config?: TigrisStorageConfig;
}

export interface CreateOrganizationResponse {
  id: string;
  name: string;
}

export async function createOrganization(
  organizationName: string,
  options?: CreateOrganizationOptions
): Promise<TigrisStorageResponse<CreateOrganizationResponse, Error>> {
  const { data: listOrganizationsResponse, error: listOrganizationsError } =
    await listOrganizations({
      config: options?.config,
    });

  if (listOrganizationsError) {
    return { error: listOrganizationsError };
  }

  if (listOrganizationsResponse.organizations.length === 0) {
    return {
      error: new Error(
        'No organizations found. Please go to https://console.storage.dev to create your first organization.'
      ),
    };
  }

  const { data: tigrisHttpClient, error } = createTigrisHttpClient(
    {
      ...options?.config,
      // Use the first organization id from the list of organizations
      organizationId: listOrganizationsResponse.organizations[0].id,
    },
    true
  );

  if (error || !tigrisHttpClient) {
    return { error };
  }

  const response = await tigrisHttpClient.request<
    { id: string; name: string },
    {
      status: 'success' | 'error';
      message: string;
      result: { namespace_id: string };
    }
  >(
    {
      method: 'POST',
      path: `/tigris-iam/namespaces`,
      body: {
        id: randomUUID().toString(),
        name: organizationName,
      },
    },
    'iam'
  );

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: {
      id: response.data.result.namespace_id,
      name: organizationName,
    },
  };
}
