import { getAuthClient } from '../../auth/client.js';
import { storeSelectedOrganization } from '../../auth/storage.js';

export async function ui(): Promise<void> {
  console.log('🔐 Tigris User Login');
  try {
    const authClient = getAuthClient();

    // Check if already authenticated
    const isAuth = await authClient.isAuthenticated();
    if (isAuth) {
      console.log('⚠️  You are already logged in.');
      console.log(
        '💡 Run "tigris logout" first if you want to login with a different account.\n'
      );
      return;
    }

    // Initiate login flow
    await authClient.login();

    // After successful login, automatically select the first organization
    const orgs = await authClient.getOrganizations();
    if (orgs.length > 0) {
      const firstOrg = orgs[0];
      storeSelectedOrganization(firstOrg.id);
      console.log('🎯 Auto-selected organization:');
      console.log(
        `   ${firstOrg.displayName || firstOrg.name} (${firstOrg.id})\n`
      );

      if (orgs.length > 1) {
        console.log(`💡 You have ${orgs.length} organizations available.`);
        console.log(
          '   Run "tigris orgs list" to see all and switch if needed.\n'
        );
      }
    }
  } catch (error) {
    // Error already logged in the client
    process.exit(1);
  }
}

export default ui;
