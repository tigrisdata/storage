import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import { ACCESS_KEY_SCOPES, type AccessKeyScope, toWireScope } from './types';

export type SetAccessKeyScopeOptions = {
  config?: TigrisIAMConfig;
};

/**
 * Change an access key's scope — whether it gets the default-allowed
 * operations (`standard`) or only what its policies and bucket roles grant
 * (`no_default_allow`). The key's bucket roles are left as they are.
 */
export async function setAccessKeyScope(
  id: string,
  scope: AccessKeyScope,
  options?: SetAccessKeyScopeOptions
): Promise<TigrisIAMResponse<void, Error>> {
  if (!id) {
    return { error: new Error('Access key ID is required') };
  }
  if (!ACCESS_KEY_SCOPES.includes(scope)) {
    return {
      error: new Error(
        `Invalid scope "${scope}". Valid scopes are: ${ACCESS_KEY_SCOPES.join(', ')}`
      ),
    };
  }

  const { data: client, error } = createIAMClient(options?.config);
  if (error) {
    return { error };
  }

  // No buckets_role in the body: the gateway then keeps the existing roles.
  const formData = new URLSearchParams();
  formData.append(
    'Req',
    JSON.stringify({ id, access_key_scope: toWireScope(scope) })
  );

  try {
    const response = await client.request<
      URLSearchParams,
      { message: string; operation: string; status: string }
    >({
      method: 'POST',
      path: IAM_ENDPOINTS.assignAccessKeys,
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    if (response.error || !response.data) {
      return { error: response.error ?? new Error('No response from server') };
    }

    if (response.data.status !== 'success') {
      return {
        error: new Error(
          response.data.message ?? 'Failed to set the access key scope'
        ),
      };
    }

    return { data: undefined };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
