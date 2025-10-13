import loginViaUi from './login';

export default async function ui(options: Record<string, unknown>) {
  console.log('🔐 Tigris Login');

  const mode = options.mode || options.M || 'ui';

  if (mode === 'credentials') {
    const accessKey =
      options['access-key'] || options['accessKey'] || options.Key;
    const accessSecret =
      options['access-secret'] || options['accessSecret'] || options.Secret;

    if (!accessKey || !accessSecret) {
      console.error(
        '❌ Access key and secret are required for credentials mode'
      );
      process.exit(1);
    }

    console.log('🔑 Authenticating with credentials...');
    console.log(`Access Key: ${accessKey}`);
    console.log(`Access Secret: ${'*'.repeat(String(accessSecret).length)}`);

    // TODO: Implement actual authentication logic
    console.log('✅ Successfully authenticated with credentials');
  } else {
    await loginViaUi();
  }
}
