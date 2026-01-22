import { randomUUID } from 'node:crypto';
import { createIAMClient } from '../http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { AccessKey } from './list';

export type CreateAccessKeyOptions = {
  config?: TigrisIAMConfig;
  bucketsRole?: {
    bucket: string;
    role: 'Editor' | 'ReadOnly';
  }[];
};

type IAMCreateAccessKeyResponse = {
  CreateAccessKeyResult: {
    AccessKey: {
      AccessKeyId: string;
      SecretAccessKey: string;
      UserName: string;
      CreateDate?: string;
    };
  };
};

export async function createAccessKey(
  name: string,
  options?: CreateAccessKeyOptions
): Promise<TigrisIAMResponse<AccessKey, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append(
    'Req',
    JSON.stringify({
      req_uuid: randomUUID().toString(),
      name,
      buckets_role: options?.bucketsRole ?? [],
    })
  );

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<
    URLSearchParams,
    IAMCreateAccessKeyResponse
  >({
    method: 'POST',
    path: `/?Action=CreateAccessKeyWithBucketsRole`,
    body: formData,
    headers,
  });

  const accessKey = response.data?.CreateAccessKeyResult?.AccessKey;

  if (response.error || !accessKey) {
    return {
      error: response.error ?? new Error('Unable to create access key'),
    };
  }

  return {
    data: {
      id: accessKey.AccessKeyId,
      secret: accessKey.SecretAccessKey,
      name: accessKey.UserName,
      createdAt: accessKey.CreateDate
        ? new Date(accessKey.CreateDate)
        : new Date(),
      status: 'active',
      roles: options?.bucketsRole?.map((role) => ({
        bucket: role.bucket,
        role: role.role,
      })),
    },
  };
}
