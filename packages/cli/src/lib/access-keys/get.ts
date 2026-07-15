import { getIAMConfig } from '@auth/iam.js';
import { getAccessKey } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('access-keys', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const id = getOption<string>(options, ['id']);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  const config = await getIAMConfig(context);

  const { data, error } = await getAccessKey(id, { config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify(data));
  } else {
    console.log(`  Name: ${data.name}`);
    console.log(`  ID: ${data.id}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Created: ${data.createdAt}`);
    console.log(`  Organization: ${data.organizationId}`);

    if (data.roles && data.roles.length > 0) {
      console.log(`  Roles:`);
      for (const role of data.roles) {
        console.log(`    - ${role.bucket}: ${role.role}`);
      }
    } else {
      console.log(`  Roles: None`);
    }
  }

  printSuccess(context);
}
