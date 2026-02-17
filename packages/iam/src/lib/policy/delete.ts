import { handleError } from '@shared/index';
import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type DeletePolicyOptions = {
  config?: TigrisIAMConfig;
};

export async function deletePolicy(
  arn: string,
  options?: DeletePolicyOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('PolicyArn', arn);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<URLSearchParams, unknown>({
    method: 'POST',
    path: IAM_ENDPOINTS.deletePolicy,
    body: formData,
    headers,
  });

  if (response.error) {
    return handleError(response.error as Error);
  }

  return { data: undefined };
}
