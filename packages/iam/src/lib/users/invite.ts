import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type InviteUserOptions = {
  config?: TigrisIAMConfig;
};

type Invitation = {
  email: string;
  role: 'member' | 'admin';
};

type InviteUserBody = {
  invitations: Invitation[];
};

type InviteUserApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: Record<string, unknown>;
};

export async function inviteUser(
  invitations: Invitation[],
  options?: InviteUserOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const response = await client.request<
    InviteUserBody,
    InviteUserApiResponse
  >({
    method: 'POST',
    path: IAM_ENDPOINTS.inviteUser,
    body: { invitations },
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
      error: new Error(response.data.message ?? 'Failed to invite users'),
    };
  }

  return { data: undefined };
}
