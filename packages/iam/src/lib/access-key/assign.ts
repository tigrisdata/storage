import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { getAccessKey } from './get';

export type AssignBucketRolesOptions = {
  config?: TigrisIAMConfig;
};

/*
    "roles" = [{"bucket":"*","role":"NamespaceAdmin"}] to make the key a namespace admin
*/
export async function assignBucketRoles(
  id: string,
  roles: { bucket: string; role: 'Editor' | 'ReadOnly' | 'NamespaceAdmin' }[],
  options?: AssignBucketRolesOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const existingRoles = await getAccessKey(id, options);
  if (existingRoles.error) {
    return { error: existingRoles.error };
  }

  const existing = (existingRoles.data?.roles ?? []).filter(
    (role) => !roles.some((n) => n.bucket === role.bucket)
  );

  const existingWildcard = existingRoles.data?.roles?.find(
    (role) => role.bucket === '*'
  );

  if (existingWildcard && roles.length > 0) {
    return {
      error: new Error(
        'This key already has admin privileges to all the buckets in your organization. Please remove the admin privileges first to assign new roles.'
      ),
    };
  }

  const hasWildcard = roles.some((role) => role.bucket === '*');

  if (
    (hasWildcard && roles.length > 1) ||
    (hasWildcard && roles[0].role !== 'NamespaceAdmin')
  ) {
    return {
      error: new Error(
        'Invalid request, cannot assign wildcard bucket role to multiple buckets'
      ),
    };
  }

  const formData = new URLSearchParams();
  formData.append(
    'Req',
    JSON.stringify({
      id,
      buckets_role: hasWildcard ? roles : [...existing, ...roles],
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
    path: IAM_ENDPOINTS.assignAccessKeys,
    body: formData,
    headers,
  });

  if (response.error || !response.data) {
    return { error: response.error ?? new Error('No response from server') };
  }

  if (response.data.status !== 'success') {
    return {
      error: new Error(response.data.message ?? 'Failed to assign roles'),
    };
  }

  return { data: undefined };
}
