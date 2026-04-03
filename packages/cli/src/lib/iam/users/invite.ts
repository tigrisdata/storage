import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { inviteUser } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('iam users', 'invite');

export default async function invite(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization('User management')) return;

  const emailOption = getOption<string | string[]>(options, ['email']);
  const roleInput = getOption<string>(options, ['role', 'r']) ?? 'member';

  const emails = Array.isArray(emailOption)
    ? emailOption
    : emailOption
      ? [emailOption]
      : [];

  if (emails.length === 0) {
    failWithError(context, 'Email address is required');
  }

  const validRoles = ['admin', 'member'] as const;
  type Role = (typeof validRoles)[number];

  if (!validRoles.includes(roleInput as Role)) {
    failWithError(
      context,
      `Invalid role "${roleInput}". Must be one of: ${validRoles.join(', ')}`
    );
  }

  const role: Role = roleInput as Role;

  const iamConfig = await getOAuthIAMConfig(context);

  const invitations = emails.map((email) => ({ email, role }));

  const { error } = await inviteUser(invitations, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'invited', email: emails.join(', ') })
    );
  }

  printSuccess(context, { email: emails.join(', ') });
}
