import { handleError } from '@shared/index';
import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import type { Policy, PolicyDocument } from './types';

export type EditPolicyOptions = {
  description: string;
  document: PolicyDocument;
  config?: TigrisIAMConfig;
};

type EditPolicyApiResponse = {
  UpdatePolicyResult: {
    Policy: {
      Arn: string;
      AttachmentCount: number;
      CreateDate: string;
      DefaultVersionId: string;
      Description: string;
      IsAttachable: null | boolean;
      Path: string;
      PermissionsBoundaryUsageCount: null | number;
      PolicyId: string;
      PolicyName: string;
      Tags: null;
      UpdateDate: string;
    };
  };
};

export async function editPolicy(
  arn: string,
  options: EditPolicyOptions
): Promise<TigrisIAMResponse<Policy, Error>> {
  const { data: client, error } = createIAMClient(options.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('PolicyArn', arn);
  formData.append('ReqUUID', crypto.randomUUID());

  formData.append('Description', options.description);

  const doc = {
    Version: options.document.version,
    Statement: options.document.statements.map((s) => ({
      Effect: s.effect,
      Action: s.action,
      Resource: s.resource,
    })),
  };
  formData.append('PolicyDocument', JSON.stringify(doc));

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<
    URLSearchParams,
    EditPolicyApiResponse
  >({
    method: 'POST',
    path: IAM_ENDPOINTS.editPolicy,
    body: formData,
    headers,
  });

  if (response.error) {
    return handleError(response.error as Error);
  }

  const policy = response.data?.UpdatePolicyResult?.Policy;
  if (!policy) {
    return { error: new Error('Failed to update policy') };
  }

  return {
    data: {
      attachmentCount: policy.AttachmentCount,
      createDate: new Date(policy.CreateDate),
      defaultVersionId: policy.DefaultVersionId,
      description: policy.Description,
      id: policy.PolicyId,
      name: policy.PolicyName,
      path: policy.Path,
      resource: policy.Arn,
      updateDate: new Date(policy.UpdateDate),
    },
  };
}
