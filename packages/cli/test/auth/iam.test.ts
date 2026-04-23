import { describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing module under test
vi.mock('../../src/auth/client.js', () => ({
  getAuthClient: vi.fn(() => ({
    isAuthenticated: vi.fn(),
    getAccessToken: vi.fn(),
  })),
  getAuth0Config: () => ({
    domain: 'test.auth0.com',
    clientId: 'test-client-id',
    audience: 'test-audience',
  }),
}));

vi.mock('../../src/auth/provider.js', () => ({
  resolveAuthMethod: vi.fn(),
  getTigrisConfig: vi.fn(() => ({
    iamEndpoint: 'https://iam.test',
    mgmtEndpoint: 'https://mgmt.test',
  })),
}));

vi.mock('../../src/auth/storage.js', () => ({
  getLoginMethod: vi.fn(),
  getSelectedOrganization: vi.fn(),
}));

vi.mock('../../src/utils/exit.js', () => ({
  failWithError: vi.fn((_ctx: unknown, msg: unknown) => {
    throw new Error(String(msg));
  }),
}));

vi.mock('../../src/utils/messages.js', () => ({
  msg: vi.fn(() => ({})),
}));

import { getAuthClient } from '../../src/auth/client.js';
import { getIAMConfig, getOAuthIAMConfig } from '../../src/auth/iam.js';
import { resolveAuthMethod } from '../../src/auth/provider.js';
import {
  getLoginMethod,
  getSelectedOrganization,
} from '../../src/auth/storage.js';
import { msg } from '../../src/utils/messages.js';

const context = msg('test');

describe('getOAuthIAMConfig', () => {
  it('throws when login method is not oauth', async () => {
    vi.mocked(getLoginMethod).mockReturnValue('credentials');
    await expect(getOAuthIAMConfig(context)).rejects.toThrow(
      'requires OAuth login'
    );
  });

  it('throws when not authenticated', async () => {
    vi.mocked(getLoginMethod).mockReturnValue('oauth');
    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(false),
      getAccessToken: vi.fn(),
    };
    vi.mocked(getAuthClient).mockReturnValue(
      mockClient as ReturnType<typeof getAuthClient>
    );

    await expect(getOAuthIAMConfig(context)).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('returns config on success', async () => {
    vi.mocked(getLoginMethod).mockReturnValue('oauth');
    vi.mocked(getSelectedOrganization).mockReturnValue('my-org');
    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAccessToken: vi.fn().mockResolvedValue('tok-123'),
    };
    vi.mocked(getAuthClient).mockReturnValue(
      mockClient as ReturnType<typeof getAuthClient>
    );

    const config = await getOAuthIAMConfig(context);
    expect(config).toEqual({
      sessionToken: 'tok-123',
      organizationId: 'my-org',
      iamEndpoint: 'https://iam.test',
      mgmtEndpoint: 'https://mgmt.test',
    });
  });

  it('returns undefined organizationId when no org selected', async () => {
    vi.mocked(getLoginMethod).mockReturnValue('oauth');
    vi.mocked(getSelectedOrganization).mockReturnValue(null);
    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAccessToken: vi.fn().mockResolvedValue('tok-123'),
    };
    vi.mocked(getAuthClient).mockReturnValue(
      mockClient as ReturnType<typeof getAuthClient>
    );

    const config = await getOAuthIAMConfig(context);
    expect(config.organizationId).toBeUndefined();
  });
});

describe('getIAMConfig', () => {
  it('delegates to getOAuthIAMConfig when type is oauth', async () => {
    vi.mocked(resolveAuthMethod).mockResolvedValue({
      type: 'oauth',
    } as Awaited<ReturnType<typeof resolveAuthMethod>>);
    vi.mocked(getLoginMethod).mockReturnValue('oauth');
    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getAccessToken: vi.fn().mockResolvedValue('tok-456'),
    };
    vi.mocked(getAuthClient).mockReturnValue(
      mockClient as ReturnType<typeof getAuthClient>
    );
    vi.mocked(getSelectedOrganization).mockReturnValue('org-1');

    const config = await getIAMConfig(context);
    expect(config).toHaveProperty('sessionToken', 'tok-456');
  });

  it.each(['credentials', 'environment', 'configured', 'aws-profile'] as const)(
    'returns credential config when type is %s',
    async (type) => {
      vi.mocked(resolveAuthMethod).mockResolvedValue({
        type,
        accessKeyId: 'ak-123',
        secretAccessKey: 'sk-456',
      } as Awaited<ReturnType<typeof resolveAuthMethod>>);
      vi.mocked(getSelectedOrganization).mockReturnValue('org-2');

      const config = await getIAMConfig(context);
      expect(config).toEqual({
        accessKeyId: 'ak-123',
        secretAccessKey: 'sk-456',
        organizationId: 'org-2',
        iamEndpoint: 'https://iam.test',
      });
    }
  );

  it('throws when type is none', async () => {
    vi.mocked(resolveAuthMethod).mockResolvedValue({
      type: 'none',
    } as Awaited<ReturnType<typeof resolveAuthMethod>>);

    await expect(getIAMConfig(context)).rejects.toThrow('Not authenticated');
  });
});
