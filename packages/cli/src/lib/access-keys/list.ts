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

import { describeDefaultPermissions } from './default-permissions.js';

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
    scope: key.scope,
    created: key.createdAt,
  }));

  // JSON and XML carry the SDK's `scope`; the table reads like the console.
  const machineReadable = format === 'json' || format === 'xml';
  const rows = machineReadable
    ? keys
    : keys.map((key) => ({
        ...key,
        scope: key.scope && describeDefaultPermissions(key.scope),
      }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'id', header: 'ID' },
    { key: 'status', header: 'Status' },
    { key: 'scope', header: 'Default permissions' },
    { key: 'created', header: 'Created' },
  ];

  const nextToken = data.paginationToken || undefined;

  const output = formatPaginatedOutput(rows, format!, 'keys', 'key', columns, {
    paginationToken: nextToken,
  });

  console.log(output);

  if (format !== 'json' && format !== 'xml') {
    printPaginationHint(nextToken);
  }

  printSuccess(context, { count: keys.length });
}
