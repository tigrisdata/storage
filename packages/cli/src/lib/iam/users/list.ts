import { getOAuthIAMConfig, isFlyOrganization } from '@auth/iam.js';
import { listUsers } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import {
  formatJson,
  formatTable,
  formatXml,
  type TableColumn,
} from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('iam users', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  if (isFlyOrganization('User management')) return;

  const iamConfig = await getOAuthIAMConfig(context);

  const { data, error } = await listUsers({
    config: iamConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  const users = data.users.map((user) => ({
    email: user.email,
    name: user.userName || '-',
    role: user.isOrgOwner ? 'owner' : user.role,
    userId: user.userId,
  }));

  const invitations = data.invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    validUntil: inv.validUntil.toLocaleDateString(),
  }));

  if (users.length === 0 && invitations.length === 0) {
    printEmpty(context);
    return;
  }

  const userColumns: TableColumn[] = [
    { key: 'email', header: 'Email' },
    { key: 'name', header: 'Name' },
    { key: 'role', header: 'Role' },
    { key: 'userId', header: 'User ID' },
  ];

  const invitationColumns: TableColumn[] = [
    { key: 'id', header: 'ID' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'status', header: 'Status' },
    { key: 'validUntil', header: 'Valid Until' },
  ];

  if (format === 'json') {
    console.log(formatJson({ users, invitations }));
  } else if (format === 'xml') {
    const lines = ['<organization>'];
    lines.push('  ' + formatXml(users, 'users', 'user').replace(/\n/g, '\n  '));
    lines.push(
      '  ' +
        formatXml(invitations, 'invitations', 'invitation').replace(
          /\n/g,
          '\n  '
        )
    );
    lines.push('</organization>');
    console.log(lines.join('\n'));
  } else {
    if (users.length > 0) {
      console.log('\nMembers');
      console.log(formatTable(users, userColumns));
    }
    if (invitations.length > 0) {
      console.log('Pending Invitations');
      console.log(formatTable(invitations, invitationColumns));
    }
  }

  const total = users.length + invitations.length;
  printSuccess(context, { count: total });
}
