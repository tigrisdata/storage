import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type AttachPolicyToAccessKeyOptions = {
  config?: TigrisIAMConfig;
};

export async function attachPolicyToAccessKey(
  accessKeyId: string,
  policyArn: string,
  options?: AttachPolicyToAccessKeyOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('PolicyArn', policyArn);
  formData.append('UserName', accessKeyId);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<URLSearchParams, unknown>({
    method: 'POST',
    path: IAM_ENDPOINTS.attachPolicy,
    body: formData,
    headers,
  });

  if (response.error) {
    return { error: response.error };
  }

  return { data: undefined };
}

export type DetachPolicyFromAccessKeyOptions = {
  config?: TigrisIAMConfig;
};

export async function detachPolicyFromAccessKey(
  accessKeyId: string,
  policyArn: string,
  options?: DetachPolicyFromAccessKeyOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('PolicyArn', policyArn);
  formData.append('UserName', accessKeyId);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<URLSearchParams, unknown>({
    method: 'POST',
    path: IAM_ENDPOINTS.detachPolicy,
    body: formData,
    headers,
  });

  if (response.error) {
    return { error: response.error };
  }

  return { data: undefined };
}

export type ListPoliciesForAccessKeyOptions = {
  config?: TigrisIAMConfig;
  paginationToken?: string;
  limit?: number;
};

export type ListPoliciesForAccessKeyResponse = {
  paginationToken?: string;
  policies: string[]; // policy names
};

type ListPoliciesForAccessKeyApiResponse = {
  ListUserPoliciesResult: {
    IsTruncated: boolean;
    Marker: string;
    PolicyNames: string[];
  };
};

export async function listPoliciesForAccessKey(
  accessKeyId: string,
  options?: ListPoliciesForAccessKeyOptions
): Promise<TigrisIAMResponse<ListPoliciesForAccessKeyResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('UserName', accessKeyId);
  formData.append('MaxItems', options?.limit?.toString() ?? '1000');
  if (options?.paginationToken) {
    formData.append('Marker', options.paginationToken);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<
    URLSearchParams,
    ListPoliciesForAccessKeyApiResponse
  >({
    method: 'POST',
    path: IAM_ENDPOINTS.listPoliciesForAccessKey,
    body: formData,
    headers,
  });

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: {
      paginationToken: response.data.ListUserPoliciesResult.IsTruncated
        ? response.data.ListUserPoliciesResult.Marker || undefined
        : undefined,
      policies: response.data.ListUserPoliciesResult.PolicyNames ?? [],
    },
  };
}
