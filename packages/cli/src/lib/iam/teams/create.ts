import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { createTeam } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { parseMembers } from './shared.js';

const context = msg('iam teams', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization('Team management')) return;

  const name = getOption<string>(options, ['name']);
  const descriptionRaw = getOption<string | boolean>(options, [
    'description',
    'd',
  ]);
  const description =
    typeof descriptionRaw === 'string' ? descriptionRaw : undefined;
  const members = parseMembers(
    context,
    getOption<string | string[] | boolean>(options, ['members', 'm'])
  );

  if (!name) {
    failWithError(context, 'Team name is required');
  }

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
