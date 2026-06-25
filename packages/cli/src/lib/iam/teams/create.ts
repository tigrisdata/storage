import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { createTeam } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('iam teams', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization('Team management')) return;

  const name = getOption<string>(options, ['name']);
  const description = getOption<string>(options, ['description', 'd']);
  const membersOption = getOption<string | string[]>(options, ['members', 'm']);

  if (!name) {
    failWithError(context, 'Team name is required');
  }

  const members = Array.isArray(membersOption)
    ? membersOption
    : membersOption
      ? [membersOption]
      : undefined;

  const iamConfig = await getOAuthIAMConfig(context);

  const { data, error } = await createTeam(
    {
      name,
      ...(description !== undefined ? { description } : {}),
      ...(members ? { members } : {}),
    },
    { config: iamConfig }
  );

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'created', teamId: data.teamId, name })
    );
    return;
  }

  printSuccess(context, { name });
  console.log(`Team ID: ${data.teamId}`);
}
