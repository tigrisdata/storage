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
  const { data: organizations, error: organizationsError } =
    await listOrganizations({
      config: options?.config,
    });

  if (organizationsError) {
    return { error: organizationsError };
  }

  if (organizations.organizations.length === 0) {
    return { error: new Error('No organizations found') };
  }

  const { data: tigrisHttpClient, error } = createTigrisHttpClient(
    {
      ...options?.config,
      endpoint: process.env.TIGRIS_STORAGE_IAM_ENDPOINT,
      organizationId: organizations.organizations[0].id,
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

  if (response?.data?.status === 'error') {
    return { error: new Error(response?.data?.message) };
  }

  return {
    data: {
      id: response?.data?.result?.namespace_id,
      name: organizationName,
    },
  };
}
