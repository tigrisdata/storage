import enquirer from 'enquirer';
const { prompt } = enquirer;
import { requireInteractive } from '@utils/interactive.js';

import credentials from './credentials.js';
import { oauth } from './oauth.js';

/**
 * Main login command
 * - If access-key/secret provided → uses credentials flow (temporary session)
 * - Otherwise → prompts user to choose between OAuth and credentials
 */
export default async function select(options: Record<string, unknown>) {
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

  // If credentials provided, use credentials flow for temporary session
  if (accessKey || accessSecret) {
    await credentials(options);
    return;
  }

  // Prompt user to choose login method
  requireInteractive(
    'Use "tigris login oauth" or "tigris login credentials --access-key ... --access-secret ..."'
  );

  const { method } = await prompt<{ method: string }>({
    type: 'select',
    name: 'method',
    message: 'Choose login method:',
    choices: [
      { name: 'user', message: 'As a user (OAuth2 flow)' },
      { name: 'machine', message: 'As a machine (Access Key & Secret)' },
    ],
  });

  if (method === 'user') {
    await oauth();
  } else {
    await credentials(options);
  }
}
