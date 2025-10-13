import { getOption } from '../../utils/options.js';
import { getAuthClient } from '../../auth/client.js';
import { storeSelectedOrganization } from '../../auth/storage.js';

export default async function select(options: Record<string, unknown>) {
  console.log('🎯 Selecting Organization');

  const name = getOption<string>(options, ['name', 'N']);

  if (!name) {
    console.error('❌ Organization name or ID is required');
    process.exit(1);
  }

  try {
    console.log(`🔍 Looking for organization: ${name}`);

    // Get authenticated client
    const authClient = getAuthClient();
    await authClient.getAccessToken();

    // Get available organizations
    const orgs = await authClient.getOrganizations();

    // Find organization by name or ID
    const org = orgs.find((o) => o.id === name || o.name === name);

    if (!org) {
      console.error(`\n❌ Organization "${name}" not found`);
      console.log('\n💡 Available organizations:');
      orgs.forEach((o) => console.log(`   - ${o.name} (${o.id})`));
      console.log();
      process.exit(1);
    }

    // Store selected organization
    storeSelectedOrganization(org.id);

    console.log('✅ Organization selected successfully!');
    console.log(`📛 Active Organization: ${org.name} (${org.id})`);
    console.log(
      '\n💡 This organization will be used for all subsequent commands'
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ ${error.message}\n`);
    } else {
      console.error('\n❌ Failed to select organization\n');
    }
    process.exit(1);
  }
}
