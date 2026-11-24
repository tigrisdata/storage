import { createTigrisHttpClient, type TigrisHttpClient } from '@shared/index';
import { DEFAULT_ENDPOINTS, getConfig } from './config';
import type { TigrisIAMConfig, TigrisIAMResponse } from './types';

export const IAM_ENDPOINTS = {
  // Teams
  teams: '/tigris-iam/teams',
  // Whoami
  whoami: '/users/whoami',
  // Usage
  usage: '/usage/invoice',
  // Users
  revokeInvitation: '/tigris-iam/invitations',
  removeUser: '/tigris-iam/namespaces',
  inviteUser: '/tigris-iam/invitations',
  listUsers: '/users/get-org?SkipNativeOrgCache=true',
  updateUserRole: '/tigris-iam/namespaces',
  // Organizations
  createOrganization: '/tigris-iam/namespaces',
  deleteOrganization: '/tigris-iam/namespaces',
  listOrganizations: '/tigris-iam/namespaces',
  // Access Keys
  assignAccessKeys: '/?Action=UpdateAccessKeyWithBucketsRole',
  createAccessKey: '/?Action=CreateAccessKeyWithBucketsRole',
  getAccessKey: '/?Detailed',
  listAccessKeys: '/?Detailed',
  removeAccessKey: '/?Action=DeleteAccessKey',
  revokeAccessKey: '/?Action=UpdateAccessKeyWithBucketsRole',
  rotateAccessKey: '/?Action=RotateAccessKey',
  // Policies
  addPolicy: '/?Action=CreatePolicy',
  deletePolicy: '/?Action=ForceDeletePolicy',
  editPolicy: '/?Action=UpdatePolicy',
  getPolicy: '/?Action=GetPolicyDetailed',
  listPolicies: '/?Action=ListPolicies',

  // policy and access key
  attachPolicy: '/?Action=AttachUserPolicy',
  detachPolicy: '/?Action=DetachUserPolicy',
  listPoliciesForAccessKey: '/?Action=ListUserPolicies',
};

function getIAMEndpoint(options?: TigrisIAMConfig): string {
  return (
    options?.iamEndpoint ?? getConfig().iamEndpoint ?? DEFAULT_ENDPOINTS.iam
  );
}

function getManagementEndpoint(options?: TigrisIAMConfig): string {
  return (
    options?.mgmtEndpoint ?? getConfig().mgmtEndpoint ?? DEFAULT_ENDPOINTS.mgmt
  );
}

export function createIAMClient(
  options?: TigrisIAMConfig,
  isManagement?: boolean
): TigrisIAMResponse<TigrisHttpClient, Error> {
  const config = getConfig();
  const sessionToken = options?.sessionToken ?? config.sessionToken;
  const organizationId = options?.organizationId ?? config.organizationId;
  // A session token here is OAuth, which wins over a key pair. The shared
  // client would sign a key pair it is given, so leave it out.
  const accessKeyId = sessionToken
    ? undefined
    : (options?.accessKeyId ?? config.accessKeyId);
  const secretAccessKey = sessionToken
    ? undefined
    : (options?.secretAccessKey ?? config.secretAccessKey);

  // Allow either session token, authorization, or credentials
  const hasCredentials = accessKeyId && secretAccessKey;
  if (!sessionToken && !hasCredentials) {
    return {
      error: new Error('Session token or credentials are required'),
    };
  }

  if (sessionToken && (!organizationId || organizationId === '')) {
    return { error: new Error('Organization ID is required') };
  }

  return createTigrisHttpClient({
    baseUrl: isManagement
      ? getManagementEndpoint(options)
      : getIAMEndpoint(options),
    sessionToken,
    organizationId,
    accessKeyId,
    secretAccessKey,
    retry: options?.retry ?? config.retry,
  });
}

/**
 * Client for the STS endpoint. STS only accepts requests signed with an access
 * key (`GetFederationToken must be signed with an access key`), so an OAuth
 * session token is refused here instead of on the wire.
 */
export function createSTSClient(
  options?: TigrisIAMConfig
): TigrisIAMResponse<TigrisHttpClient, Error> {
  const config = getConfig();
  const accessKeyId = options?.accessKeyId || config.accessKeyId;
  const secretAccessKey = options?.secretAccessKey || config.secretAccessKey;

  if (!accessKeyId || !secretAccessKey) {
    const oauth = options?.sessionToken || config.sessionToken;
    return {
      error: new Error(
        oauth
          ? 'Temporary credentials must be issued with an access key; an OAuth session cannot issue them'
          : 'An access key is required to issue temporary credentials'
      ),
    };
  }

  return createTigrisHttpClient({
    baseUrl:
      options?.stsEndpoint || config.stsEndpoint || DEFAULT_ENDPOINTS.sts,
    accessKeyId,
    secretAccessKey,
    service: 'sts',
    retry: options?.retry ?? config.retry,
  });
}
