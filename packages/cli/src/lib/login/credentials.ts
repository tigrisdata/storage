import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getTigrisConfig } from '@auth/provider.js';
import {
  clearOAuthData,
  getStoredCredentials,
  storeCredentialOrganization,
  storeLoginMethod,
  storeTemporaryCredentials,
} from '@auth/storage.js';
import { whoami } from '@tigrisdata/iam';
import { failWithError, printNextActions } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

import { DEFAULT_STORAGE_ENDPOINT } from '../../constants.js';

const context = msg('login', 'credentials');

/**
 * Login with access key + secret
 * Creates a temporary session that overrides configured credentials
 * Cleared on logout, but configured credentials remain
 */
export default async function credentials(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let accessKey =
    options['access-key'] ||
    options['accessKey'] ||
    options.key ||
    options.Key ||
    options.accesskey;
  let accessSecret =
    options['access-secret'] ||
    options['accessSecret'] ||
    options.secret ||
    options.Secret ||
    options.accesssecret;

  // If credentials not provided via CLI, prompt for them
  if (!accessKey || !accessSecret) {
    const questions = [];

    if (!accessKey) {
      questions.push({
        type: 'input',
        name: 'accessKey',
        message: 'Access Key ID:',
        required: true,
      });
    }

    if (!accessSecret) {
      questions.push({
        type: 'password',
        name: 'accessSecret',
        message: 'Secret Access Key:',
        required: true,
      });
    }

    requireInteractive('Provide --access-key and --access-secret');

    const responses = await prompt<{
      accessKey?: string;
      accessSecret?: string;
    }>(questions);

    accessKey = accessKey || responses.accessKey;
    accessSecret = accessSecret || responses.accessSecret;
  }

  // Validate
  if (!accessKey || !accessSecret) {
    failWithError(context, 'Access key and secret are required');
  }

  // Get endpoint: configured → default
  const configuredCreds = getStoredCredentials();
  const endpoint = configuredCreds?.endpoint || DEFAULT_STORAGE_ENDPOINT;

  // Store as temporary credentials (cleared on logout)
  await storeTemporaryCredentials({
    accessKeyId: accessKey as string,
    secretAccessKey: accessSecret as string,
    endpoint,
  });

  await storeLoginMethod('credentials');

  // Clear stale OAuth session from a previous login method
  await clearOAuthData();

  // Fetch and store organizationId from whoami (best-effort)
  try {
    const tigrisConfig = getTigrisConfig();
    const { data } = await whoami({
      config: {
        accessKeyId: accessKey as string,
        secretAccessKey: accessSecret as string,
        iamEndpoint: tigrisConfig.iamEndpoint,
      },
    });
    if (data?.organizationId) {
      await storeCredentialOrganization(data.organizationId, 'temporary');
    }
  } catch {
    // Non-fatal — org will just be missing
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'logged_in' }));
  }

  printSuccess(context);
  printNextActions(context);
}
