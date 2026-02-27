import { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import type { UpdateBucketResponse } from '../types';
import { setBucketSettings, SetBucketSettingsOptions } from './set';
import { BucketNotification } from '../types';

export type SetBucketNotificationsOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
  notificationConfig: BucketNotification;
};

export async function setBucketNotifications(
  bucketName: string,
  options?: SetBucketNotificationsOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const body: SetBucketSettingsOptions['body'] = {};

  if (options?.notificationConfig === undefined) {
    return {
      error: new Error('No notification configuration provided'),
    };
  }

  const { enabled, url, filter } = options.notificationConfig;

  if (!url || !url.trim()) {
    return { error: new Error('Notification URL is required') };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { error: new Error('Notification URL must use http or https') };
    }
  } catch {
    return { error: new Error('Notification URL is not a valid URL') };
  }

  const base = { enabled, web_hook: url, filter: filter ?? '' };

  if ('auth' in options.notificationConfig) {
    const { auth } = options.notificationConfig;
    if ('token' in auth) {
      if (!auth.token || !auth.token.trim()) {
        return { error: new Error('Auth token must not be empty') };
      }
      body.object_notifications = { ...base, auth: { token: auth.token } };
    } else {
      if (!auth.username || !auth.username.trim()) {
        return { error: new Error('Auth username must not be empty') };
      }
      if (!auth.password || !auth.password.trim()) {
        return { error: new Error('Auth password must not be empty') };
      }
      body.object_notifications = {
        ...base,
        auth: { basic_user: auth.username, basic_pass: auth.password },
      };
    }
  } else {
    body.object_notifications = { ...base };
  }

  return setBucketSettings(bucketName, { body, config: options?.config });
}
