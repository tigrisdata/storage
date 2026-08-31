import { getIAMConfig } from '@auth/iam.js';
import {
  ACCESS_KEY_ROLES,
  type AccessKeyRole,
  assignBucketRoles,
  type BucketRoleAssignment,
  revokeAllBucketRoles,
} from '@tigrisdata/iam';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'assign');

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function assign(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);
  const admin = getOption<boolean>(options, ['admin']);
  const revokeRoles = getOption<boolean>(options, [
    'revokeRoles',
    'revoke-roles',
  ]);
  const buckets = normalizeToArray(
    getOption<string | string[]>(options, ['bucket', 'b'])
  );
  const roles = normalizeToArray(
    getOption<string | string[]>(options, ['role', 'r'])
  );

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  if (admin && revokeRoles) {
    failWithError(context, 'Cannot use --admin and --revoke-roles together');
  }

  const config = await getIAMConfig(context);

  if (revokeRoles) {
    const { error } = await revokeAllBucketRoles(id, { config });

    if (error) {
      failWithError(context, error);
    }

    if (format === 'json') {
      console.log(JSON.stringify({ action: 'revoked', id }));
    }

    printSuccess(context);
    return;
  }

  let assignments: BucketRoleAssignment[];

  if (admin) {
    // Admin access: grant NamespaceAdmin to all buckets
    assignments = [{ bucket: '*', role: 'NamespaceAdmin' }];
  } else {
    if (buckets.length === 0) {
      failWithError(
        context,
        'At least one bucket name is required (or use --admin or --revoke-roles)'
      );
    }

    if (roles.length === 0) {
      failWithError(
        context,
        'At least one role is required (or use --admin or --revoke-roles)'
      );
    }

    // Validate all roles
    for (const role of roles) {
      if (!ACCESS_KEY_ROLES.includes(role as AccessKeyRole)) {
        failWithError(
          context,
          `Invalid role "${role}". Valid roles are: ${ACCESS_KEY_ROLES.join(', ')}`
        );
      }
    }

    // Build role assignments
    if (roles.length === 1) {
      // Single role applies to all buckets
      assignments = buckets.map((bucket) => ({
        bucket,
        role: roles[0] as AccessKeyRole,
      }));
    } else if (roles.length === buckets.length) {
      // Pair buckets with roles
      assignments = buckets.map((bucket, i) => ({
        bucket,
        role: roles[i] as AccessKeyRole,
      }));
    } else {
      failWithError(
        context,
        `Number of roles (${roles.length}) must be 1 or match number of buckets (${buckets.length})`
      );
    }
  }

  const { error } = await assignBucketRoles(id, assignments, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context);
    const output: Record<string, unknown> = {
      action: 'assigned',
      id,
      assignments,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  printSuccess(context);
  printNextActions(context);
}
