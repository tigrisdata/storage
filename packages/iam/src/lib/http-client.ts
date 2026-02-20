import { createTigrisHttpClient, type TigrisHttpClient } from '@shared/index';
import { config, DEFAULT_ENDPOINTS } from './config';
import type { TigrisIAMConfig, TigrisIAMResponse } from './types';

export const IAM_ENDPOINTS = {
  // Users
  revokeInvitation: '/tigris-iam/invitations',
  removeUser: '/tigris-iam/namespaces',
  inviteUser: '/tigris-iam/invitations',
  listUsers: '/users/get-org?SkipNativeOrgCache=true',
  updateUserRole: '/tigris-iam/namespaces',
  // Organizations
  createOrganization: '/tigris-iam/namespaces',
  listOrganizations: '/tigris-iam/namespaces',
  // Access Keys
  assignAccessKeys: '/?Action=UpdateAccessKeyWithBucketsRole',
  createAccessKey: '/?Action=CreateAccessKeyWithBucketsRole',
  getAccessKey: '/?Detailed',
  listAccessKeys: '/?Detailed',
  removeAccessKey: '/?Action=DeleteAccessKey',
  revokeAccessKey: '/?Action=UpdateAccessKeyWithBucketsRole',
  // Policies
  addPolicy: '/?Action=CreatePolicy',
  deletePolicy: '/?Action=ForceDeletePolicy',
  editPolicy: '/?Action=UpdatePolicy',
  getPolicy: '/?Action=GetPolicyDetailed',
  listPolicies: '/?Action=ListPolicies',
};

function getIAMEndpoint(options?: TigrisIAMConfig): string {
  return options?.iamEndpoint ?? config.iamEndpoint ?? DEFAULT_ENDPOINTS.iam;
}

function getManagementEndpoint(options?: TigrisIAMConfig): string {
  return options?.mgmtEndpoint ?? config.mgmtEndpoint ?? DEFAULT_ENDPOINTS.mgmt;
}

export function createIAMClient(
  options?: TigrisIAMConfig,
  isManagement?: boolean
): TigrisIAMResponse<TigrisHttpClient, Error> {
  const sessionToken = options?.sessionToken ?? config.sessionToken;
  const organizationId = options?.organizationId ?? config.organizationId;

  if (!sessionToken || sessionToken === '') {
    return { error: new Error('Session token is required') };
  }

  if (!organizationId || organizationId === '') {
    return { error: new Error('Organization ID is required') };
  }

  return createTigrisHttpClient({
    baseUrl: isManagement
      ? getManagementEndpoint(options)
      : getIAMEndpoint(options),
    sessionToken,
    organizationId,
  });
}
