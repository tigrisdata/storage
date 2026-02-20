import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import type { Invitation, User } from './types';

export type ListUsersOptions = {
  config?: TigrisIAMConfig;
};

export type ListUsersResponse = {
  users: User[];
  invitations: Invitation[];
};

type ListUsersApiResponse = {
  id: string;
  name: string;
  description: string;
  slug: string;
  owner_user_id: string;
  notification_emails: string[] | null;
  users: Array<{
    email: string;
    agreed_to_tos: boolean;
    userId: string;
    user_name: string;
    profile_picture_url: string;
    role: string;
    is_org_owner: boolean;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    namespace_id: string;
    created_by_user_id: string;
    valid_until: string;
  }> | null;
  billing: {
    email: string;
  };
  mfa_settings: {
    enabled: boolean;
  };
  quota: {
    limit_bytes: number;
  };
};

export async function listUsers(
  options?: ListUsersOptions
): Promise<TigrisIAMResponse<ListUsersResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config, true);

  if (error || !client) {
    return { error };
  }

  const response = await client.request<unknown, ListUsersApiResponse>({
    method: 'GET',
    path: IAM_ENDPOINTS.listUsers,
  });

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: {
      users:
        response.data.users?.map((user) => ({
          email: user.email,
          userId: user.userId,
          userName: user.user_name,
          profilePictureUrl: user.profile_picture_url,
          role: user.role,
          isOrgOwner: user.is_org_owner,
          agreedToTos: user.agreed_to_tos,
        })) ?? [],
      invitations:
        response.data.invitations?.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          namespaceId: inv.namespace_id,
          createdByUserId: inv.created_by_user_id,
          validUntil: new Date(inv.valid_until),
        })) ?? [],
    },
  };
}
