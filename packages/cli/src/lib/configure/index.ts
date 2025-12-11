import enquirer from 'enquirer';
const { prompt } = enquirer;
import { storeCredentials, storeLoginMethod } from '../../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('configure');

export default async function configure(options: Record<string, unknown>) {
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
  let endpoint =
    options['endpoint'] || options.e || options.E || options.Endpoint;

  // If credentials are not provided via CLI args, prompt for them
  if (!accessKey || !accessSecret || !endpoint) {
    try {
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
          initial: process.env.TIGRIS_ENDPOINT ?? 'https://t3.storage.dev',
        });
      }

      const responses = await prompt<{
        accessKey?: string;
        accessSecret?: string;
        endpoint?: string;
      }>(questions);

      accessKey = accessKey || responses.accessKey;
      accessSecret = accessSecret || responses.accessSecret;
      endpoint = endpoint || responses.endpoint;
    } catch (error) {
      printFailure(context, 'Configuration cancelled');
      process.exit(1);
    }
  }

  // Validate that all required fields are present
  if (!accessKey || !accessSecret || !endpoint) {
    printFailure(context, 'All credentials are required');
    process.exit(1);
  }

  // Store credentials
  try {
    await storeCredentials({
      accessKeyId: accessKey as string,
      secretAccessKey: accessSecret as string,
      endpoint: endpoint as string,
    });

    // Store login method
    await storeLoginMethod('credentials');

    printSuccess(context);
  } catch (error) {
    printFailure(context, 'Failed to save credentials');
    process.exit(1);
  }
}
