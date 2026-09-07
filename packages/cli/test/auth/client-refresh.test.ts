import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/storage.js', () => ({
  getTokens: vi.fn(),
  storeTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

import {
  setExternalTokenRefresher,
  TigrisAuthClient,
} from '../../src/auth/client.js';
import { getTokens } from '../../src/auth/storage.js';

// Inside the five-minute refresh window, with no refresh token to post.
const expiring = { accessToken: 'old', expiresAt: Date.now() + 60_000 };
const renewed = { accessToken: 'new', expiresAt: Date.now() + 3_600_000 };

afterEach(() => {
  setExternalTokenRefresher(null);
  vi.mocked(getTokens).mockReset();
});

describe('external token refresher', () => {
  it('is used when the store holds no refresh token', async () => {
    // The browser build: Auth0's SPA SDK keeps the refresh token in its own
    // cache, and the host renews through it.
    vi.mocked(getTokens).mockResolvedValue(expiring);
    const refresher = vi.fn(async () => renewed);
    setExternalTokenRefresher(refresher);

    expect(await new TigrisAuthClient().getAccessToken()).toBe('new');
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('is not consulted while the token is still fresh', async () => {
    vi.mocked(getTokens).mockResolvedValue({
      accessToken: 'current',
      expiresAt: Date.now() + 3_600_000,
    });
    const refresher = vi.fn(async () => renewed);
    setExternalTokenRefresher(refresher);

    expect(await new TigrisAuthClient().getAccessToken()).toBe('current');
    expect(refresher).not.toHaveBeenCalled();
  });

  it('fails as before when no refresher is registered', async () => {
    // The Node CLI never registers one; its behaviour is unchanged.
    vi.mocked(getTokens).mockResolvedValue(expiring);

    await expect(new TigrisAuthClient().getAccessToken()).rejects.toThrow(
      /No refresh token available/
    );
  });

  it('fails as before when the refresher declines', async () => {
    vi.mocked(getTokens).mockResolvedValue(expiring);
    setExternalTokenRefresher(async () => null);

    await expect(new TigrisAuthClient().getAccessToken()).rejects.toThrow(
      /No refresh token available/
    );
  });
});
