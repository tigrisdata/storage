import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import {
  ACCESS_KEY_SCOPES,
  type AccessKey,
  type AccessKeyScope,
  type BucketRoleAssignment,
  toWireScope,
} from './types';

export type CreateAccessKeyOptions = {
  config?: TigrisIAMConfig;
  bucketsRole?: BucketRoleAssignment[];
  /** Defaults to `standard` on the gateway when omitted. */
  scope?: AccessKeyScope;
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
  // An unknown scope must not fall through to the gateway's default: that
  // would silently create a key with the permissions the caller tried to
  // withhold.
  if (
    options?.scope !== undefined &&
    !ACCESS_KEY_SCOPES.includes(options.scope)
  ) {
    return {
      error: new Error(
        `Invalid scope "${options.scope}". Valid scopes are: ${ACCESS_KEY_SCOPES.join(', ')}`
      ),
    };
  }

  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append(
    'Req',
    JSON.stringify({
      req_uuid: crypto.randomUUID(),
      name,
      buckets_role: options?.bucketsRole ?? [],
      ...(options?.scope !== undefined
        ? { access_key_scope: toWireScope(options.scope) }
        : {}),
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
    path: IAM_ENDPOINTS.createAccessKey,
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
      // Not echoed by the gateway; what was asked for is what the key got.
      scope: options?.scope ?? 'standard',
    },
  };
}
