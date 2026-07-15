import { getIAMConfig } from '@auth/iam.js';
import { createAccessKey } from '@tigrisdata/iam';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);

  if (!name) {
    failWithError(context, 'Access key name is required');
  }

  const config = await getIAMConfig(context);

  const { data, error } = await createAccessKey(name, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, {
      name: data.name,
      id: data.id,
    });
    const output: Record<string, unknown> = {
      action: 'created',
      name: data.name,
      id: data.id,
      secret: data.secret,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  } else {
    console.log(`  Name: ${data.name}`);
    console.log(`  Access Key ID: ${data.id}`);
    console.log(`  Secret Access Key: ${data.secret}`);
    console.log('');
    console.log(
      '  Save these credentials securely. The secret will not be shown again.'
    );
  }

  printSuccess(context);
  printNextActions(context, { name: data.name, id: data.id });
}
