import { handleError } from '@shared/index';
import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import type { Policy, PolicyDocument } from './types';

export type GetPolicyOptions = {
  config?: TigrisIAMConfig;
};

export type GetPolicyResponse = Policy & {
  document: PolicyDocument;
  users: string[];
};

type GetPolicyApiResponse = {
  PolicyDetailed: {
    Arn: string;
    AttachmentCount: number;
    CreateDate: string;
    DefaultVersionId: string;
    Description: string;
    Document: string; // JSON string
    IsAttachable: null | boolean;
    Path: string;
    PermissionsBoundaryUsageCount: null | number;
    PolicyId: string;
    PolicyName: string;
    Tags: null;
    UpdateDate: string;
    Users: string[];
  };
};

export async function getPolicy(
  arn: string,
  options?: GetPolicyOptions
): Promise<TigrisIAMResponse<GetPolicyResponse, Error>> {
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

  const response = await client.request<URLSearchParams, GetPolicyApiResponse>({
    method: 'POST',
    path: IAM_ENDPOINTS.getPolicy,
    body: formData,
    headers,
  });

  if (response.error) {
    return handleError(response.error as Error);
  }

  const policy = response.data?.PolicyDetailed;
  if (!policy) {
    return { error: new Error('Policy not found') };
  }

  let document: PolicyDocument;
  try {
    const raw = JSON.parse(policy.Document);
    document = {
      version: raw.Version,
      statements: (Array.isArray(raw.Statement)
        ? raw.Statement
        : [raw.Statement]
      ).map(
        (s: {
          Effect: string;
          Action: string | string[];
          Resource: string | string[];
        }) => ({
          effect: s.Effect,
          action: s.Action,
          resource: s.Resource,
        })
      ),
    };
  } catch {
    return { error: new Error('Failed to parse policy document') };
  }

  return {
    data: {
      attachmentCount: policy.AttachmentCount,
      createDate: new Date(policy.CreateDate),
      defaultVersionId: policy.DefaultVersionId,
      description: policy.Description,
      document,
      id: policy.PolicyId,
      name: policy.PolicyName,
      path: policy.Path,
      resource: policy.Arn,
      updateDate: new Date(policy.UpdateDate),
      users: policy.Users ?? [],
    },
  };
}
