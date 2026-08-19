import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig } from '../types';

export type DeleteTeamOptions = {
  config?: TigrisIAMConfig;
};

export type DeleteTeamResponse = {
  teamId: string;
};

type DeleteTeamApiResponse = {
  status: 'success' | 'error';
  message?: string;
  result: unknown;
};

export async function deleteTeam(teamId: string, options?: DeleteTeamOptions) {
  const { data: client, error: clientError } = createIAMClient(options?.config);

  if (clientError || !client) {
    return { error: clientError };
  }

  const response = await client.request<unknown, DeleteTeamApiResponse>({
    method: 'DELETE',
    path: `${IAM_ENDPOINTS.teams}/${teamId}`,
  });

  if (response.error) {
    return { error: response.error };
  }

  if (response.data.status === 'error') {
    return {
      error: new Error(response.data.message ?? 'Failed to delete team'),
    };
  }

  return { data: { teamId } };
}
