import { parseXML } from '@aws-sdk/xml-builder';
import { createSTSClient } from '../http-client';
import { toApiDocument } from '../policy/document';
import type { PolicyDocument } from '../policy/types';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';
import {
  actionsFor,
  splitActions,
  type TemporaryCredentialAccess,
  type TemporaryCredentialAction,
} from './actions';

export type CreateTemporaryCredentialsOptions = {
  config?: TigrisIAMConfig;
  /** The one bucket the credentials work on. Required unless `policy` is set. */
  bucket?: string;
  /** Grant the documented read actions, write actions, or both. */
  access?: TemporaryCredentialAccess;
  /** Grant exactly these actions, in addition to any from `access`. */
  actions?: TemporaryCredentialAction[];
  /** A complete policy, instead of `bucket` with `access` or `actions`. */
  policy?: PolicyDocument;
  /** Lifetime, 900 to 129600 seconds. The gateway defaults to 43200 (12 hours). */
  durationSeconds?: number;
};

/**
 * Credentials for `@tigrisdata/storage`: spread them into its config, or
 * return them from a `credentialProvider`.
 */
export type TemporaryCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  /** Tigris keeps accepting them for up to 5 minutes after this. */
  expiration: Date;
  federatedUser: {
    id: string;
    arn: string;
  };
};

export const MIN_TEMPORARY_CREDENTIALS_DURATION = 900;
export const MAX_TEMPORARY_CREDENTIALS_DURATION = 129_600;
const MAX_POLICY_BYTES = 2048;
const NAME_PATTERN = /^[\w+=,.@-]{2,32}$/;

/**
 * Issue temporary credentials (STS `GetFederationToken`) limited to one bucket
 * and the actions you choose. They can't be revoked one by one: disabling or
 * deleting the access key that issued them ends all of them. Requires an
 * access key; an OAuth session can't issue them.
 *
 * @param name Appears in the federated user ARN. 2 to 32 characters from
 * letters, digits and `_+=,.@-`.
 */
export async function createTemporaryCredentials(
  name: string,
  options?: CreateTemporaryCredentialsOptions
): Promise<TigrisIAMResponse<TemporaryCredentials, Error>> {
  if (!NAME_PATTERN.test(name)) {
    return {
      error: new Error(
        `Invalid name "${name}". Use 2 to 32 characters from letters, digits and _+=,.@-`
      ),
    };
  }

  const duration = options?.durationSeconds;
  if (
    duration !== undefined &&
    (!Number.isInteger(duration) ||
      duration < MIN_TEMPORARY_CREDENTIALS_DURATION ||
      duration > MAX_TEMPORARY_CREDENTIALS_DURATION)
  ) {
    return {
      error: new Error(
        `Invalid durationSeconds ${duration}. Use a whole number from ${MIN_TEMPORARY_CREDENTIALS_DURATION} to ${MAX_TEMPORARY_CREDENTIALS_DURATION}`
      ),
    };
  }

  const policy = buildPolicy(options);
  if ('error' in policy) {
    return { error: policy.error };
  }

  if (new TextEncoder().encode(policy.json).length > MAX_POLICY_BYTES) {
    return {
      error: new Error(
        `Policy is larger than ${MAX_POLICY_BYTES} bytes, the most temporary credentials accept`
      ),
    };
  }

  const { data: client, error } = createSTSClient(options?.config);
  if (error) {
    return { error };
  }

  const body = new URLSearchParams({
    Action: 'GetFederationToken',
    Version: '2011-06-15',
    Name: name,
    Policy: policy.json,
    ...(duration !== undefined && { DurationSeconds: String(duration) }),
  });

  const response = await client.request<URLSearchParams, string>({
    method: 'POST',
    path: '/',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (response.error) {
    return { error: response.error };
  }

  const credentials = parseResponse(response.data);
  if (!credentials) {
    return {
      error: new Error('Unexpected response from GetFederationToken'),
    };
  }

  return { data: credentials };
}

function buildPolicy(
  options: CreateTemporaryCredentialsOptions | undefined
): { json: string } | { error: Error } {
  const { bucket, access, actions, policy } = options ?? {};

  if (policy) {
    if (bucket || access || actions) {
      return {
        error: new Error(
          'Pass either policy, or bucket with access or actions, not both'
        ),
      };
    }
    return { json: JSON.stringify(toApiDocument(policy)) };
  }

  if (!bucket) {
    return { error: new Error('bucket is required unless policy is given') };
  }

  if (!access && !actions?.length) {
    return {
      error: new Error('Pass access or actions to choose what to grant'),
    };
  }

  if (access && !['read', 'write', 'readwrite'].includes(access)) {
    return {
      error: new Error(
        `Invalid access "${access}". Valid values are: read, write, readwrite`
      ),
    };
  }

  const requested = [
    ...new Set([...(access ? actionsFor(access) : []), ...(actions ?? [])]),
  ];
  const split = splitActions(requested);
  if (split.unknown) {
    return {
      error: new Error(
        `Action "${split.unknown}" can't be granted to temporary credentials`
      ),
    };
  }

  const arn = `arn:aws:s3:::${bucket}`;
  const statements = [
    ...(split.bucket.length
      ? [{ Effect: 'Allow', Action: split.bucket, Resource: arn }]
      : []),
    ...(split.object.length
      ? [{ Effect: 'Allow', Action: split.object, Resource: `${arn}/*` }]
      : []),
  ];

  return {
    json: JSON.stringify({ Version: '2012-10-17', Statement: statements }),
  };
}

type GetFederationTokenResult = {
  Credentials?: {
    AccessKeyId?: string;
    SecretAccessKey?: string;
    SessionToken?: string;
    Expiration?: string;
  };
  FederatedUser?: { Arn?: string; FederatedUserId?: string };
};

function parseResponse(xml: unknown): TemporaryCredentials | undefined {
  if (typeof xml !== 'string') {
    return undefined;
  }

  let result: GetFederationTokenResult | undefined;
  try {
    result =
      parseXML(xml)?.GetFederationTokenResponse?.GetFederationTokenResult;
  } catch {
    return undefined;
  }

  const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } =
    result?.Credentials ?? {};
  const expiration = new Date(Expiration ?? '');

  if (
    !AccessKeyId ||
    !SecretAccessKey ||
    !SessionToken ||
    Number.isNaN(expiration.getTime())
  ) {
    return undefined;
  }

  return {
    accessKeyId: AccessKeyId,
    secretAccessKey: SecretAccessKey,
    sessionToken: SessionToken,
    expiration,
    federatedUser: {
      id: result?.FederatedUser?.FederatedUserId ?? '',
      arn: result?.FederatedUser?.Arn ?? '',
    },
  };
}
