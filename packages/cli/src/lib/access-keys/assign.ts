import { getIAMConfig } from '@auth/iam.js';
import { assignBucketRoles, revokeAllBucketRoles } from '@tigrisdata/iam';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { buildRoleAssignments, getRoleRequest } from './roles.js';

const context = msg('access-keys', 'assign');

export default async function assign(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);
  const revokeRoles = getOption<boolean>(options, [
    'revokeRoles',
    'revoke-roles',
  ]);
  const request = getRoleRequest(options);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  if (request.admin && revokeRoles) {
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

  const assignments = buildRoleAssignments(
    context,
    request,
    ' (or use --admin or --revoke-roles)'
  );

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
