import { getOption } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import {
  setBucketNotifications,
  type BucketNotification,
} from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'set-notifications');

export default async function setNotifications(
  options: Record<string, unknown>
) {
  printStart(context);

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
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  const flagCount = [enable, disable, reset].filter(Boolean).length;
  if (flagCount > 1) {
    printFailure(
      context,
      'Only one of --enable, --disable, or --reset can be used'
    );
    process.exit(1);
  }

  if (
    reset &&
    (url !== undefined ||
      filter !== undefined ||
      token !== undefined ||
      username !== undefined ||
      password !== undefined)
  ) {
    printFailure(context, 'Cannot use --reset with other options');
    process.exit(1);
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
    printFailure(context, 'Provide at least one option');
    process.exit(1);
  }

  if (token && (username !== undefined || password !== undefined)) {
    printFailure(
      context,
      'Cannot use --token with --username/--password. Choose one auth method'
    );
    process.exit(1);
  }

  if (
    (username !== undefined && password === undefined) ||
    (username === undefined && password !== undefined)
  ) {
    printFailure(context, 'Both --username and --password are required');
    process.exit(1);
  }

  const config = await getStorageConfig();
  const selectedOrg = getSelectedOrganization();
  const finalConfig = {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };

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
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { name });
}
