import {
  ACCESS_KEY_ROLES,
  type AccessKeyRole,
  type BucketRoleAssignment,
} from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import type { MessageContext } from '@utils/messages.js';
import { getOption } from '@utils/options.js';

export interface RoleRequest {
  admin: boolean;
  buckets: string[];
  roles: string[];
}

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** The `--admin`, `--bucket` and `--role` flags as given. */
export function getRoleRequest(options: Record<string, unknown>): RoleRequest {
  return {
    admin: getOption<boolean>(options, ['admin']) === true,
    buckets: normalizeToArray(
      getOption<string | string[]>(options, ['bucket', 'b'])
    ),
    roles: normalizeToArray(
      getOption<string | string[]>(options, ['role', 'r'])
    ),
  };
}

export function requestsRoles({ admin, buckets, roles }: RoleRequest): boolean {
  return admin || buckets.length > 0 || roles.length > 0;
}

/**
 * Turn the flags into per-bucket assignments: `--admin` grants every bucket,
 * otherwise one `--role` applies to every `--bucket` or the two lists pair
 * up positionally. `alternatives` names the other ways to satisfy the
 * command in the "required" errors, e.g. " (or use --admin)".
 */
export function buildRoleAssignments(
  context: MessageContext,
  { admin, buckets, roles }: RoleRequest,
  alternatives = ''
): BucketRoleAssignment[] {
  if (admin) {
    if (buckets.length > 0 || roles.length > 0) {
      failWithError(
        context,
        '--admin grants every bucket; it cannot be combined with --bucket or --role'
      );
    }
    // Admin access: grant NamespaceAdmin to all buckets
    return [{ bucket: '*', role: 'NamespaceAdmin' }];
  }

  if (buckets.length === 0) {
    failWithError(
      context,
      `At least one bucket name is required${alternatives}`
    );
  }

  if (roles.length === 0) {
    failWithError(context, `At least one role is required${alternatives}`);
  }

  for (const role of roles) {
    if (!ACCESS_KEY_ROLES.includes(role as AccessKeyRole)) {
      failWithError(
        context,
        `Invalid role "${role}". Valid roles are: ${ACCESS_KEY_ROLES.join(', ')}`
      );
    }
  }

  if (roles.length === 1) {
    // Single role applies to all buckets
    return buckets.map((bucket) => ({
      bucket,
      role: roles[0] as AccessKeyRole,
    }));
  }
  if (roles.length === buckets.length) {
    // Pair buckets with roles
    return buckets.map((bucket, i) => ({
      bucket,
      role: roles[i] as AccessKeyRole,
    }));
  }
  failWithError(
    context,
    `Number of roles (${roles.length}) must be 1 or match number of buckets (${buckets.length})`
  );
}
