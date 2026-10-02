import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export interface DeleteOrganizationOptions {
  config?: TigrisIAMConfig;
}

export interface DeleteOrganizationResponse {
  id: string;
}

/**
 * Delete an organization you own. The gateway only accepts this from an
 * OAuth session (not an access key), only for Tigris-native organizations,
 * only from the organization's owner, and only once the organization is
 * empty — no buckets, access keys, policies, teams, or other members. It
 * removes shares and invitations itself; anything else, including a refused
 * caller, comes back as the error.
 */
export async function deleteOrganization(
  organizationId: string,
  options?: DeleteOrganizationOptions
): Promise<TigrisIAMResponse<DeleteOrganizationResponse, Error>> {
  if (!organizationId) {
    return { error: new Error('Organization ID is required') };
  }

  // The request deletes the organization the session is scoped to, so the
  // target is chosen by scoping the client, not by a parameter.
  const { data: client, error } = createIAMClient({
    ...options?.config,
    organizationId,
  });

  if (error || !client) {
    return { error };
  }

  try {
    const response = await client.request<
      undefined,
      { status: 'success' | 'error'; message?: string }
    >({
      method: 'DELETE',
      path: IAM_ENDPOINTS.deleteOrganization,
    });

    if (response.error) {
      return { error: response.error };
    }

    if (response.data.status === 'error') {
      return {
        error: new Error(
          response.data.message ?? 'Failed to delete organization'
        ),
      };
    }

    return { data: { id: organizationId } };
  } catch (error) {
    // Transport failures propagate from the client as throws; callers of
    // this package only ever look at `{ error }`.
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
