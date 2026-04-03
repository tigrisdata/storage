import { getStorageConfigWithOrg } from '@auth/provider.js';
import {
  type BucketNotification,
  setBucketNotifications,
} from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'set-notifications');

export default async function setNotifications(
  options: Record<string, unknown>
) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const url = getOption<string>(options, ['url']);
  const filter = getOption<string>(options, ['filter']);
  const token = getOption<string>(options, ['token']);
  const username = getOption<string>(options, ['username']);
  const password = getOption<string>(options, ['password']);
  const enable = getOption<boolean>(options, ['enable']);
  const disable = getOption<boolean>(options, ['disable']);
  const reset = getOption<boolean>(options, ['reset']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const flagCount = [enable, disable, reset].filter(Boolean).length;
  if (flagCount > 1) {
    failWithError(
      context,
      'Only one of --enable, --disable, or --reset can be used'
    );
  }

  if (
    reset &&
    (url !== undefined ||
      filter !== undefined ||
      token !== undefined ||
      username !== undefined ||
      password !== undefined)
  ) {
    failWithError(context, 'Cannot use --reset with other options');
  }

  if (
    !enable &&
    !disable &&
    !reset &&
    url === undefined &&
    filter === undefined &&
    token === undefined &&
    username === undefined &&
    password === undefined
  ) {
    failWithError(context, 'Provide at least one option');
  }

  if (token && (username !== undefined || password !== undefined)) {
    failWithError(
      context,
      'Cannot use --token with --username/--password. Choose one auth method'
    );
  }

  if (
    (username !== undefined && password === undefined) ||
    (username === undefined && password !== undefined)
  ) {
    failWithError(context, 'Both --username and --password are required');
  }

  const finalConfig = await getStorageConfigWithOrg();

  let notificationConfig: BucketNotification;

  if (reset) {
    notificationConfig = {};
  } else {
    notificationConfig = {
      ...(enable ? { enabled: true } : {}),
      ...(disable ? { enabled: false } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(filter !== undefined ? { filter } : {}),
    };

    if (token) {
      notificationConfig = { ...notificationConfig, auth: { token } };
    } else if (username && password) {
      notificationConfig = {
        ...notificationConfig,
        auth: { username, password },
      };
    }
  }

  const { error } = await setBucketNotifications(name, {
    notificationConfig,
    config: finalConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', bucket: name }));
  }

  printSuccess(context, { name });
}
