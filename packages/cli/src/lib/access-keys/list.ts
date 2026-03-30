import { getIAMConfig } from '@auth/iam.js';
import { listAccessKeys } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import { formatOutput } from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('access-keys', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const config = await getIAMConfig(context);

  const { data, error } = await listAccessKeys({ config });

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

  const output = formatOutput(keys, format!, 'keys', 'key', [
    { key: 'name', header: 'Name' },
    { key: 'id', header: 'ID' },
    { key: 'status', header: 'Status' },
    { key: 'created', header: 'Created' },
  ]);

  console.log(output);
  printSuccess(context, { count: keys.length });
}
