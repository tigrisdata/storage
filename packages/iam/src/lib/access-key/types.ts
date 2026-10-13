/**
 * Roles that can be granted to an access key on a bucket.
 *
 * `NamespaceAdmin` is org-wide and is only valid when paired with the `*`
 * wildcard bucket — see `assignBucketRoles` for the enforcement.
 */
export const ACCESS_KEY_ROLES = [
  'ReadOnly',
  'ReadWrite',
  'Editor',
  'NamespaceAdmin',
] as const;

export type AccessKeyRole = (typeof ACCESS_KEY_ROLES)[number];

/**
 * Roles that are valid on a concrete (non-wildcard) bucket.
 *
 * `NamespaceAdmin` is excluded: it is org-wide and only meaningful paired with
 * the `*` bucket, so it cannot be granted on a single named bucket.
 */
export type BucketScopedRole = Exclude<AccessKeyRole, 'NamespaceAdmin'>;

/** A single bucket-scoped role grant on an access key. */
export type BucketRoleAssignment = {
  bucket: string;
  role: AccessKeyRole;
};

/**
 * Whether an access key gets the implicit default-allowed operations (such as
 * creating or listing buckets) on top of what its policies and bucket roles
 * grant. `standard`, the default, does; `no_default_allow` limits the key to
 * what its policies and roles explicitly allow.
 */
export const ACCESS_KEY_SCOPES = ['standard', 'no_default_allow'] as const;

export type AccessKeyScope = (typeof ACCESS_KEY_SCOPES)[number];

/** The gateway encodes the scope as a number: 0 standard, 1 no_default_allow. */
const WIRE_SCOPES: Record<AccessKeyScope, number> = {
  standard: 0,
  no_default_allow: 1,
};

export function toWireScope(scope: AccessKeyScope): number {
  return WIRE_SCOPES[scope];
}

/**
 * The gateway leaves the field out at its zero value, so an absent scope is
 * `standard`. Undefined only for a value this version does not know.
 */
export function fromWireScope(value: unknown): AccessKeyScope | undefined {
  if (value === undefined || value === null) return 'standard';
  return ACCESS_KEY_SCOPES.find((scope) => WIRE_SCOPES[scope] === value);
}

export type AccessKey = {
  id: string;
  name: string;
  secret?: string;
  createdAt: Date;
  status: 'active' | 'inactive';
  organizationId?: string;
  roles?: BucketRoleAssignment[];
  scope?: AccessKeyScope;
};

/** Raw IAM `ListAccessKeys` response, shared by `list` and `get`. */
export type IAMAccessKeysResponse = {
  IsTruncated: boolean;
  Marker: string;
  Keys: {
    access_key_id: string;
    created_at: string;
    creator: string;
    human_creator: string;
    namespace_id: string;
    status: 'active' | 'inactive';
    username: string;
    buckets_role: BucketRoleAssignment[];
    access_key_scope?: number;
  }[];
};
