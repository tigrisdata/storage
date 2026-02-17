import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getOption } from '../../../utils/options.js';
import { formatOutput } from '../../../utils/format.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { getPolicy, listPolicies } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../../utils/messages.js';

const context = msg('iam policies', 'get');

export default async function get(options: Record<string, unknown>) {
  printStart(context);

  let resource = getOption<string>(options, ['resource']);
  const format = getOption<string>(options, ['format', 'f', 'F'], 'table');

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Policies can only be retrieved when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    process.exit(1);
  }

  const authClient = getAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (!isAuthenticated) {
    printFailure(context, 'Not authenticated. Run "tigris login oauth" first.');
    process.exit(1);
  }

  const accessToken = await authClient.getAccessToken();
  const selectedOrg = getSelectedOrganization();
  const tigrisConfig = getTigrisConfig();

  const iamConfig = {
    sessionToken: accessToken,
    organizationId: selectedOrg ?? undefined,
    iamEndpoint: tigrisConfig.iamEndpoint,
  };

  // If no resource provided, list policies and let user select
  if (!resource) {
    const { data: listData, error: listError } = await listPolicies({
      config: iamConfig,
    });

    if (listError) {
      printFailure(context, listError.message);
      process.exit(1);
    }

    if (!listData.policies || listData.policies.length === 0) {
      printEmpty(context);
      return;
    }

    const { selected } = await prompt<{ selected: string }>({
      type: 'select',
      name: 'selected',
      message: 'Select a policy:',
      choices: listData.policies.map((p) => ({
        name: p.resource,
        message: `${p.name} (${p.resource})`,
      })),
    });

    resource = selected;
  }

  const { data, error } = await getPolicy(resource, {
    config: iamConfig,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
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
      console.log(`  - ${user}`);
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
