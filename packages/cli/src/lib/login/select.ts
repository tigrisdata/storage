import enquirer from 'enquirer';
const { prompt } = enquirer;
import { ui } from './ui.js';
import credentials from './credentials.js';
import { printFailure, msg } from '../../utils/messages.js';

const context = msg('login', 'select');

/**
 * Main login command - presents interactive selection between user and machine login
 * If access key and secret are provided, uses credentials flow directly
 * If --profile flag is provided, loads from saved credentials
 */
export default async function select(options: Record<string, unknown>) {
  // Check if profile flag is provided
  const profile =
    options['profile'] || options['Profile'] || options.p || options.P;

  // Check if access key and/or secret are provided
  const accessKey =
    options['access-key'] ||
    options['accessKey'] ||
    options.key ||
    options.Key ||
    options.accesskey;
  const accessSecret =
    options['access-secret'] ||
    options['accessSecret'] ||
    options.secret ||
    options.Secret ||
    options.accesssecret;

  // Check if user flag is provided
  const oauth = options['oauth'] || options['OAuth'] || options.o || options.O;

  // If profile flag is provided, use credentials flow (which loads from saved credentials)
  if (profile) {
    await credentials(options);
    return;
  }

  // If either access key or secret is provided, use credentials flow directly
  if (accessKey || accessSecret) {
    await credentials(options);
    return;
  }

  if (oauth) {
    await ui();
    return;
  }

  try {
    const response = await prompt<{ loginType: string }>({
      type: 'select',
      name: 'loginType',
      message: 'How would you like to login?',
      choices: [
        { name: 'user', message: 'As a user (OAuth2 flow)', value: 'user' },
        {
          name: 'machine',
          message: 'As a machine (Access Key & Secret)',
          value: 'machine',
        },
      ],
    });

    if (response.loginType === 'user') {
      // Start UI flow
      await ui();
    } else {
      // Start machine/credentials flow with prompting
      await credentials(options);
    }
  } catch (error) {
    printFailure(context, 'Login cancelled');
    process.exit(1);
  }
}
