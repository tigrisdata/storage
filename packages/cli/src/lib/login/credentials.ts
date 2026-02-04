import enquirer from 'enquirer';
const { prompt } = enquirer;
import {
  getSavedCredentials,
  storeLoginMethod,
  storeTemporaryCredentials,
} from '../../auth/storage.js';
import { DEFAULT_STORAGE_ENDPOINT } from '../../constants.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('login', 'credentials');

/**
 * Login with access key + secret
 * Creates a temporary session that overrides configured credentials
 * Cleared on logout, but configured credentials remain
 */
export default async function credentials(options: Record<string, unknown>) {
  printStart(context);

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

    const responses = await prompt<{
      accessKey?: string;
      accessSecret?: string;
    }>(questions);

    accessKey = accessKey || responses.accessKey;
    accessSecret = accessSecret || responses.accessSecret;
  }

  // Validate
  if (!accessKey || !accessSecret) {
    printFailure(context, 'Access key and secret are required');
    process.exit(1);
  }

  // Get endpoint: configured → default
  const configuredCreds = getSavedCredentials();
  const endpoint = configuredCreds?.endpoint || DEFAULT_STORAGE_ENDPOINT;

  // Store as temporary credentials (cleared on logout)
  await storeTemporaryCredentials({
    accessKeyId: accessKey as string,
    secretAccessKey: accessSecret as string,
    endpoint,
  });

  await storeLoginMethod('credentials');
  printSuccess(context);
}
