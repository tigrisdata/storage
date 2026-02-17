import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type ListAccessKeysOptions = {
  limit?: number;
  paginationToken?: string;
  config?: TigrisIAMConfig;
};

export type AccessKey = {
  id: string;
  name: string;
  secret?: string;
  createdAt: Date;
  status: 'active' | 'inactive';
  organizationId?: string;
  roles?: {
    bucket: string;
    role: 'Editor' | 'ReadOnly' | 'NamespaceAdmin';
  }[];
};

export type ListAccessKeysResponse = {
  accessKeys: AccessKey[];
  paginationToken?: string;
  hasMore: boolean;
};

export type IAMAccessKeysResponse = {
  IsTruncated: boolean;
  Marker: string;
  Keys: {
    access_key_id: string;
    created_at: string;
    creator: string;
    human_creator: string;
    namespace_id: string;
    status: 'active' | 'inactive';
    username: string;
    buckets_role: {
      bucket: string;
      role: 'Editor' | 'ReadOnly';
    }[];
  }[];
};

export async function listAccessKeys(
  options?: ListAccessKeysOptions
): Promise<TigrisIAMResponse<ListAccessKeysResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('Action', 'ListAccessKeys');
  formData.append('MaxItems', options?.limit?.toString() ?? '1000');
  formData.append('Marker', options?.paginationToken ?? '0');

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<URLSearchParams, IAMAccessKeysResponse>(
    {
      method: 'POST',
      path: IAM_ENDPOINTS.listAccessKeys,
      body: formData,
      headers,
    }
  );

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: {
      paginationToken:
        response.data.Marker !== '' ? response.data.Marker : undefined,
      hasMore: response.data.IsTruncated,
      accessKeys:
        response.data.Keys?.map((key) => ({
          id: key.access_key_id,
          name: key.username,
          createdAt: new Date(key.created_at),
          status: key.status,
          organizationId: key.namespace_id,
          roles: key.buckets_role?.map((role) => ({
            bucket: role.bucket,
            role: role.role,
          })),
        })) ?? [],
    },
  };
}
