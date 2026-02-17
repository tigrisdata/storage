import { getOption } from '../../../utils/options.js';
import { formatOutput } from '../../../utils/format.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { listPolicies } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../../utils/messages.js';

const context = msg('iam policies', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getOption<string>(options, ['format', 'f', 'F'], 'table');

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Policies can only be listed when logged in via OAuth.\nRun "tigris login oauth" first.'
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

  const { data, error } = await listPolicies({
    config: {
      sessionToken: accessToken,
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  if (!data.policies || data.policies.length === 0) {
    printEmpty(context);
    return;
  }

  const policies = data.policies.map((policy) => ({
    name: policy.name,
    id: policy.id,
    resource: policy.resource,
    description: policy.description || '-',
    attachments: policy.attachmentCount,
    created: policy.createDate,
    updated: policy.updateDate,
  }));

  const output = formatOutput(policies, format!, 'policies', 'policy', [
    { key: 'id', header: 'ID' },
    { key: 'resource', header: 'Resource' },
    { key: 'name', header: 'Name' },
    { key: 'description', header: 'Description' },
    { key: 'attachments', header: 'Attachments' },
    { key: 'created', header: 'Created' },
    { key: 'updated', header: 'Updated' },
  ]);

  console.log(output);
  printSuccess(context, { count: policies.length });
}
