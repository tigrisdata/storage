import { clearAllData } from '../auth/storage.js';

export default async function logout(): Promise<void> {
  try {
    console.log('🔓 Logging out...\n');

    // Clear all authentication data
    await clearAllData();

    console.log('✅ Successfully logged out');
    console.log('💡 All stored tokens and data have been cleared\n');
  } catch (error) {
    console.error('❌ Error during logout');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    }
    process.exit(1);
  }
}
