import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type RevokeAllBucketRolesOptions = {
  config?: TigrisIAMConfig;
};

export async function revokeAllBucketRoles(
  id: string,
  options?: RevokeAllBucketRolesOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append(
    'Req',
    JSON.stringify({
      id,
      buckets_role: [],
    })
  );

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<
    URLSearchParams,
    {
      message: string;
      operation: string;
      status: string;
    }
  >({
    method: 'POST',
    path: IAM_ENDPOINTS.revokeAccessKey,
    body: formData,
    headers,
  });

  if (response.error || !response.data) {
    return { error: response.error ?? new Error('No response from server') };
  }

  if (response.data.status !== 'success') {
    return {
      error: new Error(response.data.message ?? 'Failed to revoke roles'),
    };
  }

  return { data: undefined };
}
