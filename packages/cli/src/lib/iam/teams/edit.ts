import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { editTeam } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('iam teams', 'edit');

export default async function edit(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization('Team management')) return;

  const id = getOption<string>(options, ['id']);
  const name = getOption<string>(options, ['name', 'n']);
  const description = getOption<string>(options, ['description', 'd']);
  const membersOption = getOption<string | string[]>(options, ['members', 'm']);

  if (!id) {
    failWithError(context, 'Team ID is required');
  }

  const members = Array.isArray(membersOption)
    ? membersOption
    : membersOption
      ? [membersOption]
      : undefined;

  if (
    name === undefined &&
    description === undefined &&
    members === undefined
  ) {
    failWithError(
      context,
      'Provide at least one of --name, --description, or --members to update'
    );
  }

  const iamConfig = await getOAuthIAMConfig(context);

  const { error } = await editTeam(
    id,
    {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(members ? { members } : {}),
    },
    { config: iamConfig }
  );

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', teamId: id }));
  }

  printSuccess(context, { id });
}
