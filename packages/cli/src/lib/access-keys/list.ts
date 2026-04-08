import { getIAMConfig } from '@auth/iam.js';
import { listAccessKeys } from '@tigrisdata/iam';
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

const context = msg('access-keys', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const { limit, pageToken } = getPaginationOptions(options);

  const config = await getIAMConfig(context);

  const { data, error } = await listAccessKeys({
    ...(limit !== undefined ? { limit } : {}),
    ...(pageToken ? { paginationToken: pageToken } : {}),
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  if (!data.accessKeys || data.accessKeys.length === 0) {
    printEmpty(context);
    return;
  }

  const keys = data.accessKeys.map((key) => ({
    name: key.name,
    id: key.id,
    status: key.status,
    created: key.createdAt,
  }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'id', header: 'ID' },
    { key: 'status', header: 'Status' },
    { key: 'created', header: 'Created' },
  ];

  const nextToken = data.paginationToken || undefined;

  const output = formatPaginatedOutput(keys, format!, 'keys', 'key', columns, {
    paginationToken: nextToken,
  });

  console.log(output);

  if (format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: keys.length });
}
