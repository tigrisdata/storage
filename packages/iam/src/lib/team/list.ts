import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type ListTeamsOptions = {
  config?: TigrisIAMConfig;
};

export type ListTeamsResponse = {
  teams: Team[];
};

export type Team = {
  createdAt: Date;
  description: string;
  id: string;
  members: string[];
  name: string;
  updatedAt: Date;
};

type ListTeamsApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: {
    teams: Array<{
      created_at: string;
      description: string;
      id: string;
      members: Array<{
        user_id: string;
      }>;
      name: string;
      updated_at: string;
    }>;
  };
};

export async function listTeams(
  options?: ListTeamsOptions
): Promise<TigrisIAMResponse<ListTeamsResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config);

  if (error || !client) {
    return { error };
  }

  const response = await client.request<unknown, ListTeamsApiResponse>({
    method: 'GET',
    path: IAM_ENDPOINTS.teams,
  });

  if (response.error) {
    return { error: response.error };
  }

  if (response.data.status === 'error') {
    return {
      error: new Error(response.data.message ?? 'Failed to list teams'),
    };
  }

  return {
    data: {
      teams:
        response.data.result?.teams?.map((team) => ({
          createdAt: new Date(team.created_at),
          description: team.description,
          id: team.id,
          members: team.members?.map((member) => member.user_id) ?? [],
          name: team.name,
          updatedAt: new Date(team.updated_at),
        })) ?? [],
    },
  };
}
