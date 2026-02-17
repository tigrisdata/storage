import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { AccessKey, IAMAccessKeysResponse } from './list';

export type GetAccessKeyOptions = {
  config?: TigrisIAMConfig;
};

export async function getAccessKey(
  id: string,
  options?: GetAccessKeyOptions
): Promise<TigrisIAMResponse<AccessKey, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('Action', 'ListAccessKeys');
  formData.append('KeyId', id);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<URLSearchParams, IAMAccessKeysResponse>(
    {
      method: 'POST',
      path: IAM_ENDPOINTS.getAccessKey,
      body: formData,
      headers,
    }
  );

  if (response.error) {
    return { error: response.error };
  }

  const key = response.data?.Keys?.[0];
  if (!key) {
    return { error: new Error('Access key not found') };
  }

  return {
    data: {
      id: key.access_key_id,
      name: key.username,
      createdAt: new Date(key.created_at),
      status: key.status,
      organizationId: key.namespace_id,
      roles: key.buckets_role?.map((role) => ({
        bucket: role.bucket,
        role: role.role,
      })),
    },
  };
}
