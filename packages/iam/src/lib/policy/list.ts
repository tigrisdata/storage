import { handleError } from '@shared/index';
import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import type { Policy } from './types';

export type ListPoliciesOptions = {
  limit?: number;
  paginationToken?: string;
  config?: TigrisIAMConfig;
};

export type ListPoliciesResponse = {
  paginationToken?: string;
  policies: Policy[];
};

type ListPoliciesApiResponse = {
  IsTruncated: boolean;
  Marker?: string;
  ListPoliciesResult: {
    Policies: Array<{
      Arn: string;
      AttachmentCount: number;
      CreateDate: string;
      DefaultVersionId: string;
      Description: string;
      IsAttachable: null | boolean; // TODO: check why it's null
      Path: string;
      PermissionsBoundaryUsageCount: null | number; // TODO: check why it's null
      PolicyId: string;
      PolicyName: string;
      Tags: null; // TODO: check why it's null
      UpdateDate: string;
    }>;
  };
};

export async function listPolicies(
  options?: ListPoliciesOptions
): Promise<TigrisIAMResponse<ListPoliciesResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('MaxItems', options?.limit?.toString() ?? '1000');
  formData.append('Marker', options?.paginationToken ?? '0');

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<
    URLSearchParams,
    ListPoliciesApiResponse
  >({
    path: IAM_ENDPOINTS.listPolicies,
    method: 'POST',
    body: formData,
    headers,
  });

  if (response.error) {
    return handleError(response.error as Error);
  }

  if (!response.data) {
    return { error: new Error('Failed to list policies') };
  }

  return {
    data: {
      paginationToken:
        response.data.Marker !== '' ? response.data.Marker : undefined,
      policies:
        response.data.ListPoliciesResult?.Policies?.map((policy) => ({
          attachmentCount: policy.AttachmentCount,
          createDate: new Date(policy.CreateDate),
          defaultVersionId: policy.DefaultVersionId,
          description: policy.Description,
          id: policy.PolicyId,
          name: policy.PolicyName,
          path: policy.Path,
          resource: policy.Arn,
          updateDate: new Date(policy.UpdateDate),
        })) ?? [],
    },
  };
}
