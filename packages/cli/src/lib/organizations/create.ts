import { isFlyUser } from '@auth/fly.js';
import { getStorageConfig, requireOAuthLogin } from '@auth/provider.js';
import { getSelectedOrganization } from '@auth/storage.js';
import { createOrganization } from '@tigrisdata/iam';
import { failWithError, printNextActions } from '@utils/exit.js';
import { msg, printHint, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('organizations', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  if (requireOAuthLogin('Organization creation')) return;

  // Fly users cannot create organizations
  const selectedOrg = getSelectedOrganization();
  if (isFlyUser(selectedOrg ?? undefined)) {
    console.log(
      'Organization creation is not available for Fly.io users.\n' +
        'Your organizations are managed through Fly.io.\n\n' +
        'Visit https://fly.io to manage your organizations.'
    );
    return;
  }

  const name = getOption<string>(options, ['name', 'N']);

  if (!name) {
    failWithError(context, 'Organization name is required');
  }

  const config = await getStorageConfig();

  const format = getFormat(options);

  const { data, error } = await createOrganization(name, { config });

  if (error) {
    failWithError(context, error);
  }

  const id = data.id;

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'created', name, id }));
  }

  printSuccess(context, { name, id });
  printHint(context, { name });
  printNextActions(context, { name });
}
