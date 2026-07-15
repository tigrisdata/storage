import { getAuthClient } from '@auth/client.js';
import {
  clearTemporaryCredentials,
  storeSelectedOrganization,
} from '@auth/storage.js';
import { exitWithError, printNextActions } from '@utils/exit.js';
import {
  msg,
  printFailure,
  printHint,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('login', 'oauth');

export async function oauth(
  options: Record<string, unknown> = {}
): Promise<void> {
  printStart(context);

  const format = getFormat(options);
  try {
    const authClient = getAuthClient();

    // Initiate login flow with callbacks for output
    await authClient.login({
      onDeviceCode: (code, uri) => {
        console.log(`\nYour confirmation code: ${code}\n`);
        console.log(`If browser doesn't open, visit: ${uri}`);
      },
      onWaiting: () => console.log('\nWaiting for authentication...'),
    });

    // Clear stale credentials session from a previous login method
    await clearTemporaryCredentials();

    // After successful login, automatically select the first organization
    const orgs = await authClient.getOrganizations();
    if (orgs.length > 0) {
      const firstOrg = orgs[0];
      await storeSelectedOrganization(firstOrg.id);

      if (format === 'json') {
        console.log(JSON.stringify({ action: 'logged_in' }));
      }

      printSuccess(context, { org: firstOrg.name });
      printNextActions(context);

      if (orgs.length > 1) {
        printHint(context, { count: orgs.length });
      }
    } else {
      if (format === 'json') {
        console.log(JSON.stringify({ action: 'logged_in' }));
      }

      printSuccess(context, { org: 'none' });
      printNextActions(context);
    }
  } catch (error) {
    printFailure(context);
    exitWithError(error, context);
  }
}

export default oauth;
