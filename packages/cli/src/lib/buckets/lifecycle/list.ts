import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import {
  formatJson,
  formatTable,
  formatXml,
  type TableColumn,
} from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import { formatExpirationCell, formatTransitionCell } from './shared.js';

const context = msg('buckets lifecycle', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const format = getFormat(options);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const { data, error } = await getBucketInfo(name, {
    config: await getStorageConfig(),
  });

  if (error) {
    failWithError(context, error);
  }

  const rules = data?.settings.lifecycleRules ?? [];

  if (rules.length === 0) {
    printEmpty(context);
    return;
  }

  const rows = rules.map((rule) => ({
    id: rule.id ?? '-',
    prefix: rule.filter?.prefix ?? '-',
    transition: formatTransitionCell(rule),
    expiration: formatExpirationCell(rule),
    status: rule.enabled === false ? 'disabled' : 'enabled',
  }));

  const columns: TableColumn[] = [
    { key: 'id', header: 'ID' },
    { key: 'prefix', header: 'Prefix' },
    { key: 'transition', header: 'Transition' },
    { key: 'expiration', header: 'Expiration' },
    { key: 'status', header: 'Status' },
  ];

  if (format === 'json') {
    console.log(formatJson(rows));
  } else if (format === 'xml') {
    console.log(formatXml(rows, 'lifecycleRules', 'rule'));
  } else {
    console.log(formatTable(rows, columns));
  }

  printSuccess(context, { count: rules.length });
}
