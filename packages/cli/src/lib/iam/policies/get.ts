import { getOAuthIAMConfig } from '@auth/iam.js';
import { getPolicy } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { selectPolicy } from './select-policy.js';

const context = msg('iam policies', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  let resource = getOption<string>(options, ['resource']);
  const format = getFormat(options);

  const iamConfig = await getOAuthIAMConfig(context);

  if (!resource) {
    const selected = await selectPolicy(iamConfig, context);
    if (!selected) return;
    resource = selected;
  }

  const { data, error } = await getPolicy(resource, {
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    printSuccess(context);
    return;
  }

  // Display policy info
  const info = [
    { field: 'Name', value: data.name },
    { field: 'ID', value: data.id },
    { field: 'Resource', value: data.resource },
    { field: 'Description', value: data.description || '-' },
    { field: 'Path', value: data.path },
    { field: 'Version', value: data.defaultVersionId },
    { field: 'Attachments', value: String(data.attachmentCount) },
    { field: 'Created', value: data.createDate.toISOString() },
    { field: 'Updated', value: data.updateDate.toISOString() },
  ];

  const infoOutput = formatOutput(info, format!, 'policy', 'field', [
    { key: 'field', header: 'Field' },
    { key: 'value', header: 'Value' },
  ]);
  console.log(infoOutput);

  // Display attached users
  if (data.users && data.users.length > 0) {
    console.log('Attached Users:');
    for (const user of data.users) {
      console.log(`  - ${user.name} (${user.id})`);
    }
    console.log();
  }

  // Display policy document
  console.log('Policy Document:');
  console.log(`  Version: ${data.document.version}`);
  console.log('  Statements:');
  for (const stmt of data.document.statements) {
    console.log(`    - Effect: ${stmt.effect}`);
    console.log(
      `      Action: ${Array.isArray(stmt.action) ? stmt.action.join(', ') : stmt.action}`
    );
    console.log(
      `      Resource: ${Array.isArray(stmt.resource) ? stmt.resource.join(', ') : stmt.resource}`
    );
  }

  printSuccess(context);
}
