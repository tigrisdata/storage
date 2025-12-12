import { createOrganization } from '@tigrisdata/storage';
import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getAuthClient } from '../../auth/client.js';
import {
  printStart,
  printSuccess,
  printFailure,
  printHint,
  msg,
} from '../../utils/messages.js';

const context = msg('orgs', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name', 'N']);

  if (!name) {
    printFailure(context, 'Organization name is required');
    process.exit(1);
  }

  const config = await getStorageConfig();

  const { data, error } = await createOrganization(name, { config });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  const authClient = getAuthClient();
  const tokens = await authClient.refreshAccessToken();

  if (tokens.idToken) {
    await authClient.extractAndStoreOrganizations(tokens.idToken);
  }

  const orgId = data.id;

  printSuccess(context, { name, id: orgId });
  printHint(context, { name });
}
