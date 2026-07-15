import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { listTeams } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import {
  formatJson,
  formatTable,
  formatXml,
  type TableColumn,
} from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('iam teams', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization('Team management')) return;

  const iamConfig = await getOAuthIAMConfig(context);

  const { data, error } = await listTeams({
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (data.teams.length === 0) {
    printEmpty(context);
    return;
  }

  const rows = data.teams.map((team) => ({
    id: team.id,
    name: team.name,
    description: team.description || '-',
    members: team.members.length,
    created: team.createdAt,
  }));

  const columns: TableColumn[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'description', header: 'Description' },
    { key: 'members', header: 'Members' },
    { key: 'created', header: 'Created' },
  ];

  if (format === 'json') {
    // Keep the full member list (rows collapse it to a count for tables).
    console.log(formatJson({ teams: data.teams }));
  } else if (format === 'xml') {
    console.log(formatXml(rows, 'teams', 'team'));
  } else {
    console.log(formatTable(rows, columns));
  }

  printSuccess(context, { count: data.teams.length });
}
