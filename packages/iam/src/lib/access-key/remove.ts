import { createIAMClient } from '../http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type RemoveAccessKeyOptions = {
  name?: string;
  version?: string;
  config?: TigrisIAMConfig;
};

export async function removeAccessKey(
  accessKeyId: string,
  options?: RemoveAccessKeyOptions
): Promise<TigrisIAMResponse<void, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('Action', 'DeleteAccessKey');
  formData.append('Version', options?.version ?? '2010-05-08');
  if (options?.name) {
    formData.append('UserName', options.name);
  }
  formData.append('AccessKeyId', accessKeyId);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<URLSearchParams, unknown>({
    method: 'POST',
    path: ``,
    body: formData,
    headers,
  });

  if (response.error) {
    return { error: response.error };
  }

  return { data: undefined };
}
