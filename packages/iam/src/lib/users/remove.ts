import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { listUsers } from './list';

export type RemoveUserOptions = {
  config?: TigrisIAMConfig;
};

type RemoveUserBody = {
  updated_user_roles: Record<string, string>;
  removed_users: string[];
};

type RemoveUserApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: Record<string, unknown>;
};

export async function removeUser(
  userIds: string[],
  options?: RemoveUserOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data, error: listError } = await listUsers({
    config: options?.config,
  });

  if (listError) {
    return { error: listError };
  }

  const ownerIds = new Set(
    data.users.filter((u) => u.isOrgOwner).map((u) => u.userId)
  );

  const blockedOwner = userIds.find((id) => ownerIds.has(id));
  if (blockedOwner) {
    return {
      error: new Error(
        `Cannot remove organization owner (${blockedOwner}) from the organization`
      ),
    };
  }

  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const response = await client.request<RemoveUserBody, RemoveUserApiResponse>({
    method: 'PATCH',
    path: IAM_ENDPOINTS.removeUser,
    body: {
      updated_user_roles: {},
      removed_users: userIds,
    },
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (response.error) {
    return { error: response.error };
  }

  if (response.data.status === 'error') {
    return {
      error: new Error(response.data.message ?? 'Failed to remove user'),
    };
  }

  return { data: undefined };
}
