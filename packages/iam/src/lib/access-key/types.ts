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

export type AccessKey = {
  id: string;
  name: string;
  secret?: string;
  createdAt: Date;
  status: 'active' | 'inactive';
  organizationId?: string;
  roles?: BucketRoleAssignment[];
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
  }[];
};
