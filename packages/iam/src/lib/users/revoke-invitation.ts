import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type RevokeInvitationOptions = {
  config?: TigrisIAMConfig;
};

type RevokeInvitationBody = {
  invitation_ids: string[];
};

type RevokeInvitationApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: Record<string, unknown>;
};

export async function revokeInvitation(
  invitationIds: string[],
  options?: RevokeInvitationOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const response = await client.request<
    RevokeInvitationBody,
    RevokeInvitationApiResponse
  >({
    method: 'DELETE',
    path: IAM_ENDPOINTS.revokeInvitation,
    body: { invitation_ids: invitationIds },
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
        response.data.message ?? 'Failed to revoke invitation'
      ),
    };
  }

  return { data: undefined };
}
