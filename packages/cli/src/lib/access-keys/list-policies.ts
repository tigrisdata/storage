import { getIAMConfig } from '@auth/iam.js';
import { listPoliciesForAccessKey } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { formatPaginatedOutput } from '@utils/format.js';
import {
  msg,
  printEmpty,
  printPaginationHint,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getPaginationOptions } from '@utils/options.js';
import { getOption } from '@utils/options.js';

const context = msg('access-keys', 'list-policies');

export default async function listPolicies(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const { limit, pageToken } = getPaginationOptions(options);

  const id = getOption<string>(options, ['id']);

  if (!id) {
    failWithError(context, 'Access key ID is required');
  }

  const config = await getIAMConfig(context);

  const { data, error } = await listPoliciesForAccessKey(id, {
    ...(limit !== undefined ? { limit } : {}),
    ...(pageToken ? { paginationToken: pageToken } : {}),
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data.policies || data.policies.length === 0) {
    printEmpty(context);
    return;
  }

  const policies = data.policies.map((name) => ({ policy: name }));

  const columns = [
    {
      key: 'policy',
      header: policies.length > 1 ? 'Attached Policies' : 'Attached Policy',
    },
  ];

  const nextToken = data.paginationToken || undefined;

  const output = formatPaginatedOutput(
    policies,
    format!,
    'policies',
    'policy',
    columns,
    { paginationToken: nextToken }
  );

  console.log(output);

  if (format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: policies.length });
}
