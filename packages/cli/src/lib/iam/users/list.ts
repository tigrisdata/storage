import { getOption } from '../../../utils/options.js';
import {
  formatJson,
  formatXml,
  formatTable,
  type TableColumn,
} from '../../../utils/format.js';
import { getLoginMethod } from '../../../auth/s3-client.js';
import { getAuthClient } from '../../../auth/client.js';
import { getSelectedOrganization } from '../../../auth/storage.js';
import { getTigrisConfig } from '../../../auth/config.js';
import { isFlyUser } from '../../../auth/fly.js';
import { listUsers } from '@tigrisdata/iam';
import {
  printStart,
  printSuccess,
  printFailure,
  printEmpty,
  msg,
} from '../../../utils/messages.js';

const context = msg('iam users', 'list');

export default async function list(options: Record<string, unknown>) {
  printStart(context);

  const format = getOption<string>(options, ['format', 'f', 'F'], 'table');

  const loginMethod = await getLoginMethod();

  if (loginMethod !== 'oauth') {
    printFailure(
      context,
      'Users can only be listed when logged in via OAuth.\nRun "tigris login oauth" first.'
    );
    process.exit(1);
  }

  const selectedOrg = getSelectedOrganization();

  if (isFlyUser(selectedOrg ?? undefined)) {
    console.log(
      'User management is not available for Fly.io organizations.\n' +
        'Your users are managed through Fly.io.\n\n' +
        'Visit https://fly.io to manage your organization members.'
    );
    return;
  }

  const authClient = getAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (!isAuthenticated) {
    printFailure(context, 'Not authenticated. Run "tigris login oauth" first.');
    process.exit(1);
  }

  const accessToken = await authClient.getAccessToken();
  const tigrisConfig = getTigrisConfig();

  const { data, error } = await listUsers({
    config: {
      sessionToken: accessToken,
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
      mgmtEndpoint: tigrisConfig.mgmtEndpoint,
    },
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
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
