import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { listUsers } from './list';

export type UpdateUserRoleOptions = {
  config?: TigrisIAMConfig;
};

type UpdateUserRoleBody = {
  updated_user_roles: Record<string, string>;
  removed_users: string[];
};

type UpdateUserRoleApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: Record<string, unknown>;
};

export async function updateUserRole(
  roles: Array<{ userId: string; role: 'member' | 'admin' }>,
  options?: UpdateUserRoleOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const demotions = roles.filter((r) => r.role === 'member');

  if (demotions.length > 0) {
    const { data, error: listError } = await listUsers({
      config: options?.config,
    });

    if (listError) {
      return { error: listError };
    }

    const ownerIds = new Set(
      data.users.filter((u) => u.isOrgOwner).map((u) => u.userId)
    );

    const blockedOwner = demotions.find((d) => ownerIds.has(d.userId));
    if (blockedOwner) {
      return {
        error: new Error(
          `Cannot demote organization owner (${blockedOwner.userId}) from admin`
        ),
      };
    }
  }

  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const updatedRoles: Record<string, string> = {};
  for (const { userId, role } of roles) {
    updatedRoles[userId] = role;
  }

  const response = await client.request<
    UpdateUserRoleBody,
    UpdateUserRoleApiResponse
  >({
    method: 'PATCH',
    path: IAM_ENDPOINTS.updateUserRole,
    body: {
      updated_user_roles: updatedRoles,
      removed_users: [],
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
      error: new Error(
        response.data.message ?? 'Failed to update user roles'
      ),
    };
  }

  return { data: undefined };
}
