import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setBucketNotifications } from './notifications';
import type { BucketNotification } from '../types';

// -- Mocks --

const mockSetBucketSettings = vi.fn();
vi.mock('./set', () => ({
  setBucketSettings: (...args: unknown[]) => mockSetBucketSettings(...args),
}));

const mockGetBucketInfo = vi.fn();
vi.mock('../info', () => ({
  getBucketInfo: (...args: unknown[]) => mockGetBucketInfo(...args),
}));

// -- Helpers --

const successResponse = { data: { bucket: 'test-bucket', updated: true } };

const existingNotification = (
  overrides?: Partial<BucketNotification>
): BucketNotification => ({
  enabled: true,
  url: 'https://existing.com/hook',
  filter: 'prefix/',
  ...overrides,
});

const mockExistingConfig = (notification?: BucketNotification) => {
  mockGetBucketInfo.mockResolvedValue({
    data: {
      settings: {
        notifications: notification ?? existingNotification(),
      },
    },
  });
};

// -- Tests --

beforeEach(() => {
  vi.clearAllMocks();
  mockSetBucketSettings.mockResolvedValue(successResponse);
});

describe('setBucketNotifications', () => {
  // ── Scenario 1: No config or all values undefined ──

  describe('scenario 1 - empty config clears notifications', () => {
    it('sends empty object_notifications to clear', async () => {
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: {},
      });
      expect(data).toEqual(successResponse.data);
      expect(mockGetBucketInfo).not.toHaveBeenCalled();
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: { object_notifications: {} },
        config: undefined,
      });
    });
  });

  // ── Scenario 2: Toggle-only (only enabled provided) ──

  describe('scenario 2 - toggle-only', () => {
    it('disables notifications by merging with existing config', async () => {
      mockExistingConfig();
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { enabled: false },
      });
      expect(data).toEqual(successResponse.data);
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: false,
            web_hook: 'https://existing.com/hook',
            filter: 'prefix/',
          },
        },
        config: undefined,
      });
    });

    it('enables notifications by merging with existing config', async () => {
      mockExistingConfig(existingNotification({ enabled: false }));
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { enabled: true },
      });
      expect(data).toEqual(successResponse.data);
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: true,
            web_hook: 'https://existing.com/hook',
            filter: 'prefix/',
          },
        },
        config: undefined,
      });
    });

    it('preserves existing auth when toggling', async () => {
      mockExistingConfig(existingNotification({ auth: { token: 'secret' } }));
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { enabled: false },
      });
      expect(data).toEqual(successResponse.data);
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: false,
            web_hook: 'https://existing.com/hook',
            filter: 'prefix/',
            auth: { token: 'secret' },
          },
        },
        config: undefined,
      });
    });

    it('returns error when no existing config found', async () => {
      mockGetBucketInfo.mockResolvedValue({
        data: { settings: { notifications: undefined } },
      });
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { enabled: false },
      });
      expect(error?.message).toBe(
        'No existing notification configuration found to update'
      );
    });

    it('returns error when existing config has no url', async () => {
      mockExistingConfig({ enabled: false });
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { enabled: true },
      });
      expect(error?.message).toBe(
        'No existing notification configuration found to update'
      );
    });

    it('returns error when getBucketInfo fails', async () => {
      mockGetBucketInfo.mockResolvedValue({
        error: new Error('Network error'),
      });
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { enabled: false },
      });
      expect(error?.message).toBe('Network error');
    });
  });

  // ── Scenario 3: Merge without enabled ──

  describe('scenario 3 - merge retaining existing enabled', () => {
    it('retains existing enabled value when not provided', async () => {
      mockExistingConfig(existingNotification({ enabled: false }));
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'https://new.com/hook' },
      });
      expect(data).toEqual(successResponse.data);
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: false,
            web_hook: 'https://new.com/hook',
            filter: 'prefix/',
          },
        },
        config: undefined,
      });
    });

    it('merges new auth with existing config, retaining enabled', async () => {
      mockExistingConfig();
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://new.com/hook',
          auth: { token: 'new-token' },
        },
      });
      expect(data).toEqual(successResponse.data);
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: true,
            web_hook: 'https://new.com/hook',
            filter: 'prefix/',
            auth: { token: 'new-token' },
          },
        },
        config: undefined,
      });
    });

    it('defaults enabled to true when no existing config', async () => {
      mockGetBucketInfo.mockResolvedValue({
        data: { settings: { notifications: undefined } },
      });
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'https://new.com/hook' },
      });
      expect(data).toEqual(successResponse.data);
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: true,
            web_hook: 'https://new.com/hook',
            filter: '',
          },
        },
        config: undefined,
      });
    });
  });

  // ── Scenario 4: URL validation ──

  describe('scenario 4 - url validation', () => {
    it('returns error for empty url', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: '' },
      });
      expect(error?.message).toBe('Notification URL is required');
    });

    it('returns error for whitespace-only url', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: '   ' },
      });
      expect(error?.message).toBe('Notification URL is required');
    });

    it('returns error for invalid url', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'not-a-url' },
      });
      expect(error?.message).toBe('Notification URL is not a valid URL');
    });

    it('returns error for non-http url', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'ftp://example.com/hook' },
      });
      expect(error?.message).toBe('Notification URL must use http or https');
    });

    it('accepts valid https url', async () => {
      mockExistingConfig();
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'https://example.com/hook' },
      });
      expect(data).toEqual(successResponse.data);
    });

    it('accepts valid http url', async () => {
      mockExistingConfig();
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'http://example.com/hook' },
      });
      expect(data).toEqual(successResponse.data);
    });
  });

  // ── Scenario 5: Username/password validation ──

  describe('scenario 5 - username/password validation', () => {
    it('returns error for empty username', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          auth: { username: '', password: 'pass' },
        },
      });
      expect(error?.message).toBe('Auth username must not be empty');
    });

    it('returns error for empty password', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          auth: { username: 'user', password: '' },
        },
      });
      expect(error?.message).toBe('Auth password must not be empty');
    });

    it('returns error for empty auth object', async () => {
      const config = {
        url: 'https://example.com/hook',
        auth: {},
      } as unknown as BucketNotification;
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: config,
      });
      expect(error?.message).toBe(
        'Auth must include either token or username and password'
      );
    });

    it('accepts valid username/password', async () => {
      mockExistingConfig();
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          auth: { username: 'user', password: 'pass' },
        },
      });
      expect(data).toEqual(successResponse.data);
    });
  });

  // ── Scenario 6: Token validation ──

  describe('scenario 6 - token validation', () => {
    it('returns error for empty token', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          auth: { token: '' },
        },
      });
      expect(error?.message).toBe('Auth token must not be empty');
    });

    it('returns error for whitespace-only token', async () => {
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          auth: { token: '   ' },
        },
      });
      expect(error?.message).toBe('Auth token must not be empty');
    });

    it('accepts valid token', async () => {
      mockExistingConfig();
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          auth: { token: 'valid-token' },
        },
      });
      expect(data).toEqual(successResponse.data);
    });
  });

  // ── Scenario 7: Token + username/password conflict ──

  describe('scenario 7 - auth conflict (runtime)', () => {
    it('returns error when both token and username are provided', async () => {
      const config = {
        url: 'https://example.com/hook',
        auth: { token: 'secret', username: 'user', password: 'pass' },
      } as unknown as BucketNotification;
      const { error } = await setBucketNotifications('test-bucket', {
        notificationConfig: config,
      });
      expect(error?.message).toBe(
        'Only one of auth.token or auth.username and auth.password can be provided'
      );
    });
  });

  // ── Scenario 8: Override ──

  describe('scenario 8 - override', () => {
    it('sends config directly without fetching existing when override is true', async () => {
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://new.com/hook',
          enabled: true,
        },
        override: true,
      });
      expect(data).toEqual(successResponse.data);
      expect(mockGetBucketInfo).not.toHaveBeenCalled();
      expect(mockSetBucketSettings).toHaveBeenCalledWith('test-bucket', {
        body: {
          object_notifications: {
            enabled: true,
            web_hook: 'https://new.com/hook',
            filter: '',
          },
        },
        config: undefined,
      });
    });

    it('does not merge with existing when override is true', async () => {
      const { data } = await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://new.com/hook',
          enabled: false,
          auth: { token: 'new-token' },
        },
        override: true,
      });
      expect(data).toEqual(successResponse.data);
      expect(mockGetBucketInfo).not.toHaveBeenCalled();
    });

    it('fetches existing and merges when override is false (default)', async () => {
      mockExistingConfig();
      await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'https://new.com/hook' },
      });
      expect(mockGetBucketInfo).toHaveBeenCalled();
    });
  });

  // ── buildAndSend body mapping ──

  describe('body mapping', () => {
    it('maps token auth to API format', async () => {
      mockExistingConfig();
      await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          enabled: true,
          auth: { token: 'secret' },
        },
      });
      const body = mockSetBucketSettings.mock.calls[0][1].body;
      expect(body.object_notifications.auth).toEqual({ token: 'secret' });
    });

    it('maps basic auth to API format', async () => {
      mockExistingConfig();
      await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          enabled: true,
          auth: { username: 'user', password: 'pass' },
        },
      });
      const body = mockSetBucketSettings.mock.calls[0][1].body;
      expect(body.object_notifications.auth).toEqual({
        basic_user: 'user',
        basic_pass: 'pass',
      });
    });

    it('sends no auth when not provided', async () => {
      mockExistingConfig();
      await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          enabled: true,
        },
      });
      const body = mockSetBucketSettings.mock.calls[0][1].body;
      expect(body.object_notifications.auth).toBeUndefined();
    });

    it('defaults enabled to true when omitted', async () => {
      mockExistingConfig({ url: 'https://existing.com/hook' });
      await setBucketNotifications('test-bucket', {
        notificationConfig: { url: 'https://example.com/hook' },
      });
      const body = mockSetBucketSettings.mock.calls[0][1].body;
      expect(body.object_notifications.enabled).toBe(true);
    });

    it('defaults filter to empty string when omitted and no existing', async () => {
      mockGetBucketInfo.mockResolvedValue({
        data: { settings: { notifications: undefined } },
      });
      await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          enabled: true,
        },
      });
      const body = mockSetBucketSettings.mock.calls[0][1].body;
      expect(body.object_notifications.filter).toBe('');
    });

    it('retains existing filter when merging', async () => {
      mockExistingConfig();
      await setBucketNotifications('test-bucket', {
        notificationConfig: {
          url: 'https://example.com/hook',
          enabled: true,
        },
      });
      const body = mockSetBucketSettings.mock.calls[0][1].body;
      expect(body.object_notifications.filter).toBe('prefix/');
    });
  });
});
