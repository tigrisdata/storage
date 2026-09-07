import { afterEach, describe, expect, it, vi } from 'vitest';

// The real store writes ~/.tigris/config.json; never let it near a test.
vi.mock('../../src/auth/storage.js', () => ({
  clearAllData: vi.fn(),
  getLoginMethod: vi.fn(),
  getSelectedOrganization: vi.fn(),
  getTokens: vi.fn(),
  storeCredentialOrganization: vi.fn(),
  storeLoginMethod: vi.fn(),
  storeOrganizations: vi.fn(),
  storeSelectedOrganization: vi.fn(),
  storeTemporaryCredentials: vi.fn(),
  storeTokens: vi.fn(),
}));

import {
  getLoginMethod,
  getTokens,
  storeTokens,
} from '../../src/auth/storage.js';
import { renewOAuthSession } from '../../src/browser/session.js';

const current = {
  accessToken: 'old-access',
  idToken: 'id-token-from-login',
  expiresAt: 1_000,
};

afterEach(() => vi.resetAllMocks());

describe('renewOAuthSession', () => {
  it('keeps the ID token when the refresh carries none', async () => {
    // Regression: the renewed set was installed wholesale, and a refresh
    // response without an id_token wiped the one `whoami` reads.
    vi.mocked(getLoginMethod).mockReturnValue('oauth');
    vi.mocked(getTokens).mockResolvedValue(current);

    await renewOAuthSession({ accessToken: 'new-access', expiresAt: 2_000 });

    expect(storeTokens).toHaveBeenCalledWith({
      accessToken: 'new-access',
      idToken: 'id-token-from-login',
      expiresAt: 2_000,
    });
  });

  it('takes a new ID token when the refresh carries one', async () => {
    vi.mocked(getLoginMethod).mockReturnValue('oauth');
    vi.mocked(getTokens).mockResolvedValue(current);

    await renewOAuthSession({
      accessToken: 'new-access',
      idToken: 'id-token-refreshed',
      expiresAt: 2_000,
    });

    expect(storeTokens).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'id-token-refreshed' })
    );
  });

  it('refuses when there is no OAuth session to renew', async () => {
    vi.mocked(getLoginMethod).mockReturnValue('credentials');
    vi.mocked(getTokens).mockResolvedValue(null);

    await expect(
      renewOAuthSession({ accessToken: 'new-access' })
    ).rejects.toThrow(/Not authenticated/);
    expect(storeTokens).not.toHaveBeenCalled();
  });
});
