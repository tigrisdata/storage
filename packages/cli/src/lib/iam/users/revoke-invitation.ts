import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { listUsers, revokeInvitation as revokeInv } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('iam users', 'revoke-invitation');

export default async function revokeInvitation(
  options: Record<string, unknown>
) {
  printStart(context);

  const format = getFormat(options);

  const resourceOption = getOption<string | string[]>(options, ['resource']);
  const force = getOption<boolean>(options, ['yes', 'y']);

  if (isFlyOrganization()) return;

  const iamConfig = await getOAuthIAMConfig(context);

  let resources = Array.isArray(resourceOption)
    ? resourceOption
    : resourceOption
      ? [resourceOption]
      : [];

  // If no resource provided, list invitations and let user select
  if (resources.length === 0) {
    const { data: listData, error: listError } = await listUsers({
      config: iamConfig,
    });

    if (listError) {
      failWithError(context, listError);
    }

    if (listData.invitations.length === 0) {
      printEmpty(context);
      return;
    }

    requireInteractive('Provide invitation ID(s) as a positional argument');

    const { selected } = await prompt<{ selected: string[] }>({
      type: 'multiselect',
      name: 'selected',
      message:
        'Select invitation(s) to revoke (space to select, enter to confirm):',
      choices: listData.invitations.map((inv) => ({
        name: inv.id,
        message: `${inv.email} (${inv.role} - ${inv.status})`,
      })),
    });

    resources = selected;
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Revoke ${resources.length} invitation(s)?`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { error } = await revokeInv(resources, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'revoked', invitations: resources }));
  }

  printSuccess(context);
}
