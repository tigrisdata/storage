import { getOAuthIAMConfig } from '@auth/iam.js';
import { listPolicies } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('iam policies', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const iamConfig = await getOAuthIAMConfig(context);

  const { data, error } = await listPolicies({
    config: {
      sessionToken: iamConfig.sessionToken,
      organizationId: iamConfig.organizationId,
      iamEndpoint: iamConfig.iamEndpoint,
    },
  });

  if (error) {
    failWithError(context, error);
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
