import enquirer from 'enquirer';
const { prompt } = enquirer;
import { getTigrisConfig } from '@auth/provider.js';
import {
  storeCredentialOrganization,
  storeCredentials,
} from '@auth/storage.js';
import { whoami } from '@tigrisdata/iam';
import { exitWithError, failWithError, printNextActions } from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

import { DEFAULT_STORAGE_ENDPOINT } from '../../constants.js';

const context = msg('configure');

export default async function configure(options: Record<string, unknown>) {
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
  let endpoint =
    options['endpoint'] || options.e || options.E || options.Endpoint;

  // If credentials are not provided via CLI args, prompt for them
  if (!accessKey || !accessSecret || !endpoint) {
    const questions = [];

    if (!accessKey) {
      questions.push({
        type: 'input',
        name: 'accessKey',
        message: 'Tigris Access Key ID:',
        required: true,
      });
    }

    if (!accessSecret) {
      questions.push({
        type: 'password',
        name: 'accessSecret',
        message: 'Tigris Secret Access Key:',
        required: true,
      });
    }

    if (!endpoint) {
      questions.push({
        type: 'input',
        name: 'endpoint',
        message: 'Tigris Endpoint:',
        required: true,
        initial: DEFAULT_STORAGE_ENDPOINT,
      });
    }

    requireInteractive('Provide --access-key, --access-secret, and --endpoint');

    const responses = await prompt<{
      accessKey?: string;
      accessSecret?: string;
      endpoint?: string;
    }>(questions);

    accessKey = accessKey || responses.accessKey;
    accessSecret = accessSecret || responses.accessSecret;
    endpoint = endpoint || responses.endpoint;
  }

  // Validate that all required fields are present
  if (!accessKey || !accessSecret || !endpoint) {
    failWithError(context, 'All credentials are required');
  }

  // Store credentials
  try {
    await storeCredentials({
      accessKeyId: accessKey as string,
      secretAccessKey: accessSecret as string,
      endpoint: endpoint as string,
    });

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
        await storeCredentialOrganization(data.organizationId, 'saved');
      }
    } catch {
      // Non-fatal — org will just be missing
    }

    if (format === 'json') {
      console.log(JSON.stringify({ action: 'configured' }));
    }

    printSuccess(context);
    printNextActions(context);
  } catch (error) {
    printFailure(context, 'Failed to save credentials');
    exitWithError(error, context);
  }
}
