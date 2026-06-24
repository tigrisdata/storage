import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type CreateTeamInput = {
  name: string;
  description?: string;
  members?: string[];
};

export type CreateTeamOptions = {
  config?: TigrisIAMConfig;
};

export type CreateTeamResponse = {
  teamId: string;
};

type CreateTeamApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: {
    team_id: string;
  };
};

export async function createTeam(
  team: CreateTeamInput,
  options?: CreateTeamOptions
): Promise<TigrisIAMResponse<CreateTeamResponse, Error>> {
  const { data: client, error: clientError } = createIAMClient(options?.config);

  if (clientError || !client) {
    return { error: clientError };
  }

  const { data, error } = await client.request<unknown, CreateTeamApiResponse>({
    method: 'POST',
    path: IAM_ENDPOINTS.teams,
    body: {
      name: team.name,
      ...(team.description !== undefined && { description: team.description }),
      ...(team.members && {
        members: team.members.map((member) => ({
          user_id: member,
        })),
      }),
    },
  });

  if (error) {
    return { error };
  }

  if (data.status === 'error') {
    return {
      error: new Error(data.message ?? 'Failed to create team'),
    };
  }

  if (!data.result?.team_id) {
    return {
      error: new Error('Failed to create team'),
    };
  }

  return {
    data: {
      teamId: data.result.team_id,
    },
  };
}
