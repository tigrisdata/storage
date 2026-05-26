import { type Scoped, TigrisBase } from '@shared/index';
import {
  type AssignBucketRolesOptions,
  assignBucketRoles,
} from './access-key/assign';
import {
  type CreateAccessKeyOptions,
  createAccessKey,
} from './access-key/create';
import { type GetAccessKeyOptions, getAccessKey } from './access-key/get';
import {
  type AccessKey,
  type ListAccessKeysOptions,
  type ListAccessKeysResponse,
  listAccessKeys,
} from './access-key/list';
import {
  type AttachPolicyToAccessKeyOptions,
  attachPolicyToAccessKey,
  type DetachPolicyFromAccessKeyOptions,
  detachPolicyFromAccessKey,
  type ListPoliciesForAccessKeyOptions,
  type ListPoliciesForAccessKeyResponse,
  listPoliciesForAccessKey,
} from './access-key/policy';
import {
  type RemoveAccessKeyOptions,
  removeAccessKey,
} from './access-key/remove';
import {
  type RevokeAllBucketRolesOptions,
  revokeAllBucketRoles,
} from './access-key/revoke';
import {
  type RotateAccessKeyOptions,
  type RotateAccessKeyResponse,
  rotateAccessKey,
} from './access-key/rotate';
import { DEFAULT_ENDPOINTS } from './config';
import {
  type CreateOrganizationOptions,
  type CreateOrganizationResponse,
  createOrganization,
} from './organization/create';
import {
  type ListOrganizationsOptions,
  type ListOrganizationsResponse,
  listOrganizations,
} from './organization/list';
import { type AddPolicyOptions, addPolicy } from './policy/add';
import { type DeletePolicyOptions, deletePolicy } from './policy/delete';
import { type EditPolicyOptions, editPolicy } from './policy/edit';
import {
  type GetPolicyOptions,
  type GetPolicyResponse,
  getPolicy,
} from './policy/get';
import {
  type ListPoliciesOptions,
  type ListPoliciesResponse,
  listPolicies,
} from './policy/list';
import type { Policy } from './policy/types';
import type { TigrisIAMConfig, TigrisIAMResponse } from './types';
import { type InviteUserOptions, inviteUser } from './users/invite';
import {
  type ListUsersOptions,
  type ListUsersResponse,
  listUsers,
} from './users/list';
import { type RemoveUserOptions, removeUser } from './users/remove';
import {
  type RevokeInvitationOptions,
  revokeInvitation,
} from './users/revoke-invitation';
import {
  type UpdateUserRoleOptions,
  updateUserRole,
} from './users/update-role';
import { type WhoamiOptions, type WhoamiResponse, whoami } from './whoami';

/**
 * Class-based client for `@tigrisdata/iam`. Same auth shape as
 * {@link import('@tigrisdata/storage').Tigris}; `bucket` and
 * `forcePathStyle` on `TigrisInit` are ignored. Per-call option types
 * drop `config` since the constructor holds it.
 *
 * The constructor is lenient — no validation, no throws. Missing or
 * malformed fields surface as `{ error }` from the bare functions on
 * first use, the same way they do for the bare-function API.
 */
export class TigrisIAM extends TigrisBase {
  async #buildConfig(): Promise<TigrisIAMResponse<TigrisIAMConfig>> {
    const { data: authFields, error } = await this.resolveAuthFields();
    if (error) return { error };

    return {
      data: {
        iamEndpoint: this.init?.endpoints?.iam ?? DEFAULT_ENDPOINTS.iam,
        mgmtEndpoint: this.init?.endpoints?.mgmt ?? DEFAULT_ENDPOINTS.mgmt,
        ...authFields,
      },
    };
  }

  // --- Whoami ---

  whoami = async (
    opts?: Scoped<WhoamiOptions>
  ): Promise<TigrisIAMResponse<WhoamiResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return whoami({ ...opts, config });
  };

  // --- Access keys ---

  createAccessKey = async (
    name: string,
    opts?: Scoped<CreateAccessKeyOptions>
  ): Promise<TigrisIAMResponse<AccessKey, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return createAccessKey(name, { ...opts, config });
  };

  getAccessKey = async (
    id: string,
    opts?: Scoped<GetAccessKeyOptions>
  ): Promise<TigrisIAMResponse<AccessKey, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return getAccessKey(id, { ...opts, config });
  };

  listAccessKeys = async (
    opts?: Scoped<ListAccessKeysOptions>
  ): Promise<TigrisIAMResponse<ListAccessKeysResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return listAccessKeys({ ...opts, config });
  };

  removeAccessKey = async (
    accessKeyId: string,
    opts?: Scoped<RemoveAccessKeyOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return removeAccessKey(accessKeyId, { ...opts, config });
  };

  rotateAccessKey = async (
    accessKeyId: string,
    opts?: Scoped<RotateAccessKeyOptions>
  ): Promise<TigrisIAMResponse<RotateAccessKeyResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return rotateAccessKey(accessKeyId, { ...opts, config });
  };

  assignBucketRoles = async (
    id: string,
    roles: Parameters<typeof assignBucketRoles>[1],
    opts?: Scoped<AssignBucketRolesOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return assignBucketRoles(id, roles, { ...opts, config });
  };

  revokeAllBucketRoles = async (
    id: string,
    opts?: Scoped<RevokeAllBucketRolesOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return revokeAllBucketRoles(id, { ...opts, config });
  };

  attachPolicyToAccessKey = async (
    accessKeyId: string,
    policyArn: string,
    opts?: Scoped<AttachPolicyToAccessKeyOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return attachPolicyToAccessKey(accessKeyId, policyArn, { ...opts, config });
  };

  detachPolicyFromAccessKey = async (
    accessKeyId: string,
    policyArn: string,
    opts?: Scoped<DetachPolicyFromAccessKeyOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return detachPolicyFromAccessKey(accessKeyId, policyArn, {
      ...opts,
      config,
    });
  };

  listPoliciesForAccessKey = async (
    accessKeyId: string,
    opts?: Scoped<ListPoliciesForAccessKeyOptions>
  ): Promise<TigrisIAMResponse<ListPoliciesForAccessKeyResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return listPoliciesForAccessKey(accessKeyId, { ...opts, config });
  };

  // --- Users ---

  listUsers = async (
    opts?: Scoped<ListUsersOptions>
  ): Promise<TigrisIAMResponse<ListUsersResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return listUsers({ ...opts, config });
  };

  inviteUser = async (
    invitations: Parameters<typeof inviteUser>[0],
    opts?: Scoped<InviteUserOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return inviteUser(invitations, { ...opts, config });
  };

  removeUser = async (
    userIds: string[],
    opts?: Scoped<RemoveUserOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return removeUser(userIds, { ...opts, config });
  };

  revokeInvitation = async (
    invitationIds: string[],
    opts?: Scoped<RevokeInvitationOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return revokeInvitation(invitationIds, { ...opts, config });
  };

  updateUserRole = async (
    roles: Parameters<typeof updateUserRole>[0],
    opts?: Scoped<UpdateUserRoleOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return updateUserRole(roles, { ...opts, config });
  };

  // --- Policies ---

  addPolicy = async (
    name: string,
    opts: Scoped<AddPolicyOptions>
  ): Promise<TigrisIAMResponse<Policy, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return addPolicy(name, { ...opts, config });
  };

  editPolicy = async (
    arn: string,
    opts: Scoped<EditPolicyOptions>
  ): Promise<TigrisIAMResponse<Policy, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return editPolicy(arn, { ...opts, config });
  };

  deletePolicy = async (
    arn: string,
    opts?: Scoped<DeletePolicyOptions>
  ): Promise<TigrisIAMResponse<void, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return deletePolicy(arn, { ...opts, config });
  };

  getPolicy = async (
    arn: string,
    opts?: Scoped<GetPolicyOptions>
  ): Promise<TigrisIAMResponse<GetPolicyResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return getPolicy(arn, { ...opts, config });
  };

  listPolicies = async (
    opts?: Scoped<ListPoliciesOptions>
  ): Promise<TigrisIAMResponse<ListPoliciesResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return listPolicies({ ...opts, config });
  };

  // --- Organizations ---

  createOrganization = async (
    organizationName: string,
    opts?: Scoped<CreateOrganizationOptions>
  ): Promise<TigrisIAMResponse<CreateOrganizationResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return createOrganization(organizationName, { ...opts, config });
  };

  listOrganizations = async (
    opts?: Scoped<ListOrganizationsOptions>
  ): Promise<TigrisIAMResponse<ListOrganizationsResponse, Error>> => {
    const { data: config, error } = await this.#buildConfig();
    if (error) return { error };
    return listOrganizations({ ...opts, config });
  };
}
