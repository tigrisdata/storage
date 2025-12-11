import enquirer from 'enquirer';
const { prompt } = enquirer;
import {
  getCredentials,
  storeLoginMethod,
  storeTemporaryCredentials,
} from '../../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('login', 'credentials');

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

  // Check if --profile flag is provided
  const useProfile =
    options['profile'] || options['Profile'] || options.p || options.P;

  // If no credentials provided via CLI, check for saved credentials and prompt
  if (!accessKey || !accessSecret) {
    const savedCreds = getCredentials();

    if (savedCreds) {
      // If --profile flag is used, automatically use saved credentials
      if (useProfile) {
        accessKey = savedCreds.accessKeyId;
        accessSecret = savedCreds.secretAccessKey;
      } else {
        // Saved credentials exist - ask user if they want to use them
        try {
          const response = await prompt<{ useSaved: boolean }>({
            type: 'confirm',
            name: 'useSaved',
            message: 'Saved credentials found. Use them?',
            initial: true,
          });

          if (response.useSaved) {
            accessKey = savedCreds.accessKeyId;
            accessSecret = savedCreds.secretAccessKey;
          } else {
            // User chose not to use saved credentials, prompt for new ones

            const credPrompts = [];

            if (!accessKey) {
              credPrompts.push({
                type: 'input',
                name: 'accessKey',
                message: 'Tigris Access Key ID:',
                required: true,
              });
            }

            if (!accessSecret) {
              credPrompts.push({
                type: 'password',
                name: 'accessSecret',
                message: 'Tigris Secret Access Key:',
                required: true,
              });
            }

            const credResponses = await prompt<{
              accessKey?: string;
              accessSecret?: string;
            }>(credPrompts);

            accessKey = accessKey || credResponses.accessKey;
            accessSecret = accessSecret || credResponses.accessSecret;
          }
        } catch (error) {
          printFailure(context, 'Login cancelled');
          process.exit(1);
        }
      }
    } else {
      // No saved credentials
      if (useProfile) {
        printFailure(
          context,
          'No saved credentials found. Please run "tigris configure" first.'
        );
        process.exit(1);
      }

      // Prompt for them
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

        const responses = await prompt<{
          accessKey?: string;
          accessSecret?: string;
        }>(questions);

        accessKey = accessKey || responses.accessKey;
        accessSecret = accessSecret || responses.accessSecret;
      } catch (error) {
        printFailure(context, 'Login cancelled');
        process.exit(1);
      }
    }
  }

  // Validate that all required fields are present
  if (!accessKey || !accessSecret) {
    printFailure(context, 'Access key and secret are required');
    process.exit(1);
  }

  // Get endpoint from saved credentials or use default
  const savedCreds = getCredentials();
  const endpoint = savedCreds?.endpoint || 'https://t3.storage.dev';

  // Store temporary credentials (will be cleared on logout)
  await storeTemporaryCredentials({
    accessKeyId: accessKey as string,
    secretAccessKey: accessSecret as string,
    endpoint,
  });

  // Store login method
  await storeLoginMethod('credentials');

  printSuccess(context);
}
