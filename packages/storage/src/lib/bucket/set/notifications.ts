import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import { getBucketInfo } from '../info';
import type { BucketNotification, UpdateBucketResponse } from '../types';
import { type SetBucketSettingsOptions, setBucketSettings } from './set';

export type SetBucketNotificationsOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
  notificationConfig: BucketNotification;
  override?: boolean;
};

/**
 * Configure webhook notifications for object events on a bucket.
 *
 * **Scenarios:**
 *
 * 1. If `notificationConfig` is empty (`{}`), sends it as-is to clear notifications.
 *
 * 2. If only `enabled` is provided, fetches the existing config and merges
 *    with the new `enabled` value. Errors if no existing config is found.
 *
 * 3. If config is provided without `enabled`, fetches existing config and
 *    merges, retaining the existing `enabled` value.
 *
 * 4. `url` is validated when provided (must be a valid http/https URL).
 *
 * 5. `auth.username` and `auth.password` are validated when provided.
 *
 * 6. `auth.token` is validated when provided.
 *
 * 7. `auth.token` and `auth.username`/`auth.password` cannot be provided together.
 *
 * 8. `override` replaces the existing config when `true`.
 *    When `false` (default), merges with the existing config.
 */
export async function setBucketNotifications(
  bucketName: string,
  options: SetBucketNotificationsOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { notificationConfig, config, override = false } = options;

  const hasAuth = 'auth' in notificationConfig;

  // 1. Empty config — send as-is to clear notifications
  if (
    notificationConfig.enabled === undefined &&
    notificationConfig.url === undefined &&
    notificationConfig.filter === undefined &&
    !hasAuth
  ) {
    return setBucketSettings(bucketName, {
      body: { object_notifications: {} },
      config,
    });
  }

  // 4. Validate URL when provided
  if (notificationConfig.url !== undefined) {
    const urlError = validateUrl(notificationConfig.url);
    if (urlError) return { error: urlError };
  }

  // Validate auth
  if ('auth' in notificationConfig) {
    const authError = validateAuth(notificationConfig.auth);
    if (authError) return { error: authError };
  }

  // 8. Override: replace existing config entirely
  if (override) {
    return buildAndSend(bucketName, notificationConfig, config);
  }

  // Merge with existing config
  const isToggleOnly =
    notificationConfig.url === undefined &&
    notificationConfig.filter === undefined &&
    !hasAuth;

  const { data, error } = await getBucketInfo(bucketName, { config });
  if (error) return { error };

  const existing = data?.settings.notifications;

  // 2. Toggle-only: must have existing config to merge with
  if (isToggleOnly) {
    if (!existing?.url) {
      return {
        error: new Error(
          'No existing notification configuration found to update'
        ),
      };
    }
    return buildAndSend(
      bucketName,
      { ...existing, enabled: notificationConfig.enabled },
      config
    );
  }

  // 3. Merge new config with existing, retaining existing enabled if not provided
  const merged: BucketNotification = { ...existing, ...notificationConfig };
  if (notificationConfig.enabled === undefined) {
    merged.enabled = existing?.enabled;
  }

  return buildAndSend(bucketName, merged, config);
}

function validateUrl(url: string): Error | undefined {
  if (url.trim() === '') {
    return new Error('Notification URL is required');
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return new Error('Notification URL must use http or https');
    }
  } catch {
    return new Error('Notification URL is not a valid URL');
  }
}

// 5, 6, 7. Validate auth fields
function validateAuth(
  auth: Extract<BucketNotification, { auth: unknown }>['auth']
): Error | undefined {
  const a = auth as Record<string, unknown>;

  // Auth must have at least one strategy
  if (
    a.token === undefined &&
    a.username === undefined &&
    a.password === undefined
  ) {
    return new Error('Auth must include either token or username and password');
  }

  // 7. Can't provide both token and username/password (runtime safety net for JS consumers)
  if (
    a.token !== undefined &&
    (a.username !== undefined || a.password !== undefined)
  ) {
    return new Error(
      'Only one of auth.token or auth.username and auth.password can be provided'
    );
  }

  // 6. Token must not be empty
  if (typeof a.token === 'string' && a.token.trim() === '') {
    return new Error('Auth token must not be empty');
  }

  // 5. Username and password must not be empty
  if (a.username !== undefined || a.password !== undefined) {
    if (typeof a.username !== 'string' || a.username.trim() === '') {
      return new Error('Auth username must not be empty');
    }
    if (typeof a.password !== 'string' || a.password.trim() === '') {
      return new Error('Auth password must not be empty');
    }
  }
}

function buildAndSend(
  bucketName: string,
  notificationConfig: BucketNotification,
  config?: Omit<TigrisStorageConfig, 'bucket'>
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { url, filter } = notificationConfig;

  if (!url) {
    return Promise.resolve({
      error: new Error('Notification URL is required'),
    });
  }

  const enabled = notificationConfig.enabled ?? true;
  const base = { enabled, web_hook: url, filter: filter ?? '' };
  const body: SetBucketSettingsOptions['body'] = {};

  if ('auth' in notificationConfig) {
    const { auth } = notificationConfig;
    if (typeof auth.token === 'string') {
      body.object_notifications = { ...base, auth: { token: auth.token } };
    } else if (
      typeof auth.username === 'string' &&
      typeof auth.password === 'string'
    ) {
      body.object_notifications = {
        ...base,
        auth: { basic_user: auth.username, basic_pass: auth.password },
      };
    } else {
      body.object_notifications = { ...base };
    }
  } else {
    body.object_notifications = { ...base };
  }

  return setBucketSettings(bucketName, { body, config });
}
