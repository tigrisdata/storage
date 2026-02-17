import { randomUUID } from 'node:crypto';
import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { listOrganizations } from './list';

export interface CreateOrganizationOptions {
  config?: TigrisIAMConfig;
}

export interface CreateOrganizationResponse {
  id: string;
  name: string;
}

export async function createOrganization(
  organizationName: string,
  options?: CreateOrganizationOptions
): Promise<TigrisIAMResponse<CreateOrganizationResponse, Error>> {
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

  const organizationId = listOrganizationsResponse.organizations[0].id;

  const { data: client, error } = createIAMClient({
    ...options?.config,
    organizationId,
  });

  if (error || !client) {
    return { error };
  }

  const response = await client.request<
    { id: string; name: string },
    {
      status: 'success' | 'error';
      message: string;
      result: { namespace_id: string };
    }
  >({
    method: 'POST',
    path: IAM_ENDPOINTS.createOrganization,
    body: {
      id: randomUUID().toString(),
      name: organizationName,
    },
  });

  if (response.error) {
    return { error: response.error };
  }

  if (response.data.status === 'error') {
    return { error: new Error(response.data.message) };
  }

  return {
    data: {
      id: response.data.result.namespace_id,
      name: organizationName,
    },
  };
}
