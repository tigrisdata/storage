import { createIAMClient, IAM_ENDPOINTS } from './http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from './types';

export type WhoamiOptions = {
  config?: TigrisIAMConfig;
};

export type WhoamiResponse = {
  userId: string;
  organizationId: string;
};

type WhoamiApiResponse = {
  UserId: string;
  NamespaceId: string;
};

export async function whoami(
  options?: WhoamiOptions
): Promise<TigrisIAMResponse<WhoamiResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config, true);

  if (error) {
    return { error };
  }

  const response = await client.request<unknown, WhoamiApiResponse>({
    method: 'GET',
    path: IAM_ENDPOINTS.whoami,
  });

  if (response.error) {
    return { error: response.error };
  }

  return {
    data: {
      userId: response.data.UserId,
      organizationId: response.data.NamespaceId,
    },
  };
}
