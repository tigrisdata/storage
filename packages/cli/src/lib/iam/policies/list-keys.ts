import { getOAuthIAMConfig } from '@auth/iam.js';
import { getPolicy } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { selectPolicy } from './select-policy.js';

const context = msg('iam policies', 'list-keys');

export default async function listKeys(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let resource = getOption<string>(options, ['resource']);

  const iamConfig = await getOAuthIAMConfig(context);

  if (!resource) {
    const selected = await selectPolicy(iamConfig, context);
    if (!selected) return;
    resource = selected;
  }

  const { data, error } = await getPolicy(resource, { config: iamConfig });

  if (error) {
    failWithError(context, error);
  }

  if (!data.users || data.users.length === 0) {
    printEmpty(context);
    return;
  }

  const keys = data.users.map((u) => ({ name: u.name, id: u.id }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'id', header: 'ID' },
  ];

  const output = formatOutput(keys, format!, 'keys', 'key', columns);

  console.log(output);

  printSuccess(context, { count: keys.length });
}
