import { getAuthClient } from '../auth/client.js';
import { getSelectedOrganization } from '../auth/storage.js';

export default async function whoami(): Promise<void> {
  try {
    const authClient = getAuthClient();

    // Check if authenticated
    const isAuth = await authClient.isAuthenticated();
    if (!isAuth) {
      console.log('❌ Not authenticated');
      console.log('💡 Run "tigris login" to authenticate\n');
      return;
    }

    // Get ID token claims
    const claims = await authClient.getIdTokenClaims();
    const organizations = await authClient.getOrganizations();
    const selectedOrg = getSelectedOrganization();

    console.log('\n👤 User Information:');
    console.log(`   Email: ${claims.email || 'N/A'}`);
    console.log(`   User ID: ${claims.sub}`);

    if (organizations.length > 0) {
      console.log(`\n📂 Organizations (${organizations.length}):`);
      organizations.forEach((org) => {
        const isSelected = org.id === selectedOrg;
        const marker = isSelected ? '→' : ' ';
        console.log(`   ${marker} ${org.name} (${org.id})`);
      });

      if (selectedOrg) {
        const selected = organizations.find((o) => o.id === selectedOrg);
        if (selected) {
          console.log(`\n✓ Active: ${selected.name}`);
        }
      }
    } else {
      console.log('\n📂 Organizations: None');
    }

    console.log();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ ${error.message}\n`);
    } else {
      console.error('\n❌ Failed to retrieve user information\n');
    }
    process.exit(1);
  }
}
