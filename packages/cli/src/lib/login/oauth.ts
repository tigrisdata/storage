import { getAuthClient } from '../../auth/client.js';
import { storeSelectedOrganization } from '../../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  printAlreadyDone,
  printHint,
  msg,
} from '../../utils/messages.js';

const context = msg('login', 'oauth');

export async function oauth(): Promise<void> {
  printStart(context);
  try {
    const authClient = getAuthClient();

    // Check if already authenticated
    const isAuth = await authClient.isAuthenticated();
    if (isAuth) {
      printAlreadyDone(context);
      return;
    }

    // Initiate login flow with callbacks for output
    await authClient.login({
      onDeviceCode: (code, uri) => {
        console.log(`\nYour confirmation code: ${code}\n`);
        console.log(`If browser doesn't open, visit: ${uri}`);
      },
      onWaiting: () => console.log('\nWaiting for authentication...'),
    });

    // After successful login, automatically select the first organization
    const orgs = await authClient.getOrganizations();
    if (orgs.length > 0) {
      const firstOrg = orgs[0];
      await storeSelectedOrganization(firstOrg.id);
      printSuccess(context, { org: firstOrg.displayName || firstOrg.name });

      if (orgs.length > 1) {
        printHint(context, { count: orgs.length });
      }
    } else {
      printSuccess(context, { org: 'none' });
    }
  } catch (error) {
    printFailure(context);
    process.exit(1);
  }
}

export default oauth;
