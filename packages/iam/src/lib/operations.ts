/**
 * The package's full set of bare-function operations. `index.ts`
 * re-exports this wholesale as the public API; `tigris-iam.ts` imports
 * it as a namespace object to bind every function onto `TigrisIAM`
 * (see `bindOperations`). Kept separate from `index.ts` itself so that
 * import stays a straight line rather than a cycle back through the
 * file that also exports `TigrisIAM`.
 */
export type { TigrisConfig } from '@shared/types';
export {
  type AssignBucketRolesOptions,
  assignBucketRoles,
} from './access-key/assign';
export {
  type CreateAccessKeyOptions,
  createAccessKey,
} from './access-key/create';
export { type GetAccessKeyOptions, getAccessKey } from './access-key/get';
export {
  type AccessKey,
  type ListAccessKeysOptions,
  type ListAccessKeysResponse,
  listAccessKeys,
} from './access-key/list';
export {
  type AttachPolicyToAccessKeyOptions,
  attachPolicyToAccessKey,
  type DetachPolicyFromAccessKeyOptions,
  detachPolicyFromAccessKey,
  type ListPoliciesForAccessKeyOptions,
  type ListPoliciesForAccessKeyResponse,
  listPoliciesForAccessKey,
} from './access-key/policy';
export {
  type RemoveAccessKeyOptions,
  removeAccessKey,
} from './access-key/remove';
export {
  type RevokeAllBucketRolesOptions,
  revokeAllBucketRoles,
} from './access-key/revoke';
export {
  type RotateAccessKeyOptions,
  type RotateAccessKeyResponse,
  rotateAccessKey,
} from './access-key/rotate';
export {
  type CreateOrganizationOptions,
  type CreateOrganizationResponse,
  createOrganization,
} from './organization/create';
export {
  type ListOrganizationsOptions,
  type ListOrganizationsResponse,
  listOrganizations,
  type Organization,
} from './organization/list';
export { type AddPolicyOptions, addPolicy } from './policy/add';
export { type DeletePolicyOptions, deletePolicy } from './policy/delete';
export { type EditPolicyOptions, editPolicy } from './policy/edit';
export {
  type GetPolicyOptions,
  type GetPolicyResponse,
  getPolicy,
} from './policy/get';
export {
  type ListPoliciesOptions,
  type ListPoliciesResponse,
  listPolicies,
} from './policy/list';
export type { Policy, PolicyDocument, PolicyStatement } from './policy/types';
export {
  type CreateTeamInput,
  type CreateTeamOptions,
  type CreateTeamResponse,
  createTeam,
} from './team/create';
export {
  type EditTeamOptions,
  type EditTeamResponse,
  editTeam,
} from './team/edit';
export {
  type ListTeamsOptions,
  type ListTeamsResponse,
  listTeams,
  type Team,
} from './team/list';
export { type InviteUserOptions, inviteUser } from './users/invite';
export {
  type ListUsersOptions,
  type ListUsersResponse,
  listUsers,
} from './users/list';
export { type RemoveUserOptions, removeUser } from './users/remove';
export {
  type RevokeInvitationOptions,
  revokeInvitation,
} from './users/revoke-invitation';
export type { Invitation, User } from './users/types';
export {
  type UpdateUserRoleOptions,
  updateUserRole,
} from './users/update-role';
export { type WhoamiOptions, type WhoamiResponse, whoami } from './whoami';
