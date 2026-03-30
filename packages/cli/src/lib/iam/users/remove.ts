import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { listUsers, removeUser as removeUserFromOrg } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('iam users', 'remove');

export default async function removeUser(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const resourceOption = getOption<string | string[]>(options, ['resource']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (isFlyOrganization()) return;

  const iamConfig = await getOAuthIAMConfig(context);

  let resources = Array.isArray(resourceOption)
    ? resourceOption
    : resourceOption
      ? [resourceOption]
      : [];

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
      message: 'Select user(s) to remove (space to select, enter to confirm):',
      choices: listData.users.map((user) => ({
        name: user.userId,
        message: `${user.email} (${user.isOrgOwner ? 'owner' : user.role})`,
      })),
    });

    resources = selected;
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(`Remove ${resources.length} user(s)?`);
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { error } = await removeUserFromOrg(resources, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'removed', users: resources }));
  }

  printSuccess(context);
}
