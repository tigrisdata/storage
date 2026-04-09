import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type RotateAccessKeyOptions = {
  config?: TigrisIAMConfig;
};

export type RotateAccessKeyResponse = {
  id: string;
  newSecret: string;
};

type IAMRotateAccessKeyResponse = {
  message: string;
  rotate_access_key_result: {
    id: string;
    new_secret: string;
  };
  status: string;
};

export async function rotateAccessKey(
  accessKeyId: string,
  options?: RotateAccessKeyOptions
): Promise<TigrisIAMResponse<RotateAccessKeyResponse, Error>> {
  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  const formData = new URLSearchParams();
  formData.append('Action', 'RotateAccessKey');
  formData.append('AccessKeyId', accessKeyId);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const response = await client.request<
    URLSearchParams,
    IAMRotateAccessKeyResponse
  >({
    method: 'POST',
    path: IAM_ENDPOINTS.rotateAccessKey,
    body: formData,
    headers,
  });

  if (response.error || response.data?.status !== 'success') {
    return {
      error:
        response.error ??
        new Error(response.data?.message ?? 'Unable to rotate access key'),
    };
  }

  return {
    data: {
      id: response.data?.rotate_access_key_result.id,
      newSecret: response.data?.rotate_access_key_result.new_secret,
    },
  };
}
