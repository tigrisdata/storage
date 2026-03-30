import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { listUsers, updateUserRole } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('iam users', 'update-role');

export default async function updateRole(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization()) return;

  const validRoles = ['admin', 'member'] as const;
  type Role = (typeof validRoles)[number];

  const roleOption = getOption<string | string[]>(options, ['role', 'r']);

  if (!roleOption) {
    failWithError(
      context,
      'Role is required. Use --role admin or --role member'
    );
  }

  const roles = Array.isArray(roleOption) ? roleOption : [roleOption];

  for (const r of roles) {
    if (!validRoles.includes(r as Role)) {
      failWithError(
        context,
        `Invalid role "${r}". Must be one of: ${validRoles.join(', ')}`
      );
    }
  }

  const resourceOption = getOption<string | string[]>(options, ['resource']);

  let resources = Array.isArray(resourceOption)
    ? resourceOption
    : resourceOption
      ? [resourceOption]
      : [];

  const iamConfig = await getOAuthIAMConfig(context);

  // If no resource provided, list users and let user select
  if (resources.length === 0) {
    const { data: listData, error: listError } = await listUsers({
      config: iamConfig,
    });

    if (listError) {
      failWithError(context, listError);
    }

    if (listData.users.length === 0) {
      printEmpty(context);
      return;
    }

    requireInteractive('Provide user ID(s) as a positional argument');

    const { selected } = await prompt<{ selected: string[] }>({
      type: 'multiselect',
      name: 'selected',
      message: 'Select user(s) to update (space to select, enter to confirm):',
      choices: listData.users.map((user) => ({
        name: user.userId,
        message: `${user.email} (${user.isOrgOwner ? 'owner' : user.role})`,
      })),
    });

    resources = selected;
  }

  // Pair roles with users: if one role given, apply to all; otherwise pair 1:1
  if (roles.length > 1 && roles.length !== resources.length) {
    failWithError(
      context,
      `Number of roles (${roles.length}) must match number of users (${resources.length}), or provide a single role for all users`
    );
  }

  const roleUpdates = resources.map((userId, i) => ({
    userId,
    role: (roles.length === 1 ? roles[0] : roles[i]) as Role,
  }));

  const { error } = await updateUserRole(roleUpdates, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', users: roleUpdates }));
  }

  printSuccess(context);
}
