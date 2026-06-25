import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import type { CreateTeamInput } from './create';

export type EditTeamOptions = {
  config?: TigrisIAMConfig;
};

export type EditTeamResponse = {
  teamId: string;
};

type EditTeamApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: unknown;
};

export async function editTeam(
  teamId: string,
  team: Partial<CreateTeamInput>,
  options?: EditTeamOptions
): Promise<TigrisIAMResponse<EditTeamResponse, Error>> {
  const { data: client, error: clientError } = createIAMClient(options?.config);

  if (clientError || !client) {
    return { error: clientError };
  }

  const body = {
    ...(team?.name && { name: team.name }),
    ...(team?.description !== undefined && { description: team.description }),
    ...(team?.members && {
      members: team.members.map((member) => ({ user_id: member })),
    }),
  };

  if (Object.keys(body).length === 0) {
    return {
      error: new Error('No fields to update'),
    };
  }

  const { data, error } = await client.request<unknown, EditTeamApiResponse>({
    method: 'PATCH',
    path: `${IAM_ENDPOINTS.teams}/${teamId}`,
    body,
  });

  if (error) {
    return { error };
  }

  if (data.status === 'error') {
    return {
      error: new Error(data.message ?? 'Failed to edit team'),
    };
  }

  return {
    data: {
      teamId,
    },
  };
}
