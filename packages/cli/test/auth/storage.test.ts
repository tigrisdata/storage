import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock os.homedir() to return a temp directory so tests don't touch real config
let tempHome: string;
vi.mock('os', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => tempHome,
  };
});

function configPath(): string {
  return join(tempHome, '.tigris', 'config.json');
}

function writeRawConfig(data: unknown): void {
  mkdirSync(join(tempHome, '.tigris'), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(data, null, 2));
}

function readRawConfig(): unknown {
  return JSON.parse(readFileSync(configPath(), 'utf8'));
}

describe('auth/storage', () => {
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'tigris-test-'));
    // Reset module cache so each test gets fresh state
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // v1 → v2 Migration
  // ---------------------------------------------------------------------------
  describe('v1 → v2 migration', () => {
    it('preserves saved credentials', async () => {
      const v1Config = {
        tokens: {
          accessToken: 'old-token',
          refreshToken: 'old-refresh',
          expiresAt: 999,
        },
        organizations: [{ id: 'org-1', name: 'My Org' }],
        selectedOrganization: 'org-1',
        credentials: {
          accessKeyId: 'AKID',
          secretAccessKey: 'SECRET',
          endpoint: 'https://example.com',
        },
        temporaryCredentials: {
          accessKeyId: 'TMP-AKID',
          secretAccessKey: 'TMP-SECRET',
          endpoint: 'https://example.com',
        },
        loginMethod: 'oauth',
      };
      writeRawConfig(v1Config);

      const storage = await import('../../src/auth/storage.js');
      const creds = storage.getStoredCredentials();

      expect(creds).toEqual({
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
        endpoint: 'https://example.com',
      });
    });

    it('discards tokens, orgs, loginMethod, temporaryCredentials', async () => {
      const v1Config = {
        tokens: { accessToken: 't', expiresAt: 1 },
        organizations: [{ id: 'org-1', name: 'Org' }],
        selectedOrganization: 'org-1',
        credentials: {
          accessKeyId: 'AKID',
          secretAccessKey: 'SECRET',
          endpoint: 'https://example.com',
        },
        temporaryCredentials: {
          accessKeyId: 'TMP',
          secretAccessKey: 'TMP-S',
          endpoint: 'https://tmp.com',
        },
        loginMethod: 'oauth',
      };
      writeRawConfig(v1Config);

      const storage = await import('../../src/auth/storage.js');

      // Tokens should be gone
      expect(await storage.getTokens()).toBeNull();
      // Organizations should be empty
      expect(storage.getOrganizations()).toEqual([]);
      // Login method should be cleared
      expect(storage.getLoginMethod()).toBeNull();
      // selectedOrganization should be cleared
      expect(storage.getSelectedOrganization()).toBeNull();

      // Config should now be v2 on disk
      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['version']).toBe(2);
    });

    it('handles v1 config with no credentials gracefully', async () => {
      const v1Config = {
        tokens: { accessToken: 't', expiresAt: 1 },
        loginMethod: 'oauth',
      };
      writeRawConfig(v1Config);

      const storage = await import('../../src/auth/storage.js');
      expect(storage.getStoredCredentials()).toBeNull();
      expect(storage.getLoginMethod()).toBeNull();
    });

    it('handles v1 config with invalid credentials shape', async () => {
      const v1Config = {
        credentials: { accessKeyId: 'AKID' }, // missing secretAccessKey and endpoint
        loginMethod: 'credentials',
      };
      writeRawConfig(v1Config);

      const storage = await import('../../src/auth/storage.js');
      expect(storage.getStoredCredentials()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getSelectedOrganization — method-aware branching
  // ---------------------------------------------------------------------------
  describe('getSelectedOrganization', () => {
    it('returns OAuth org when activeMethod is oauth', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'oauth',
        oauth: { selectedOrganization: 'oauth-org-1' },
        credentials: {
          saved: {
            accessKeyId: 'A',
            secretAccessKey: 'S',
            endpoint: 'https://e.com',
            organizationId: 'cred-org-1',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      expect(storage.getSelectedOrganization()).toBe('oauth-org-1');
    });

    it('returns credential org when activeMethod is credentials', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        oauth: { selectedOrganization: 'oauth-org-1' },
        credentials: {
          saved: {
            accessKeyId: 'A',
            secretAccessKey: 'S',
            endpoint: 'https://e.com',
            organizationId: 'cred-org-1',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      expect(storage.getSelectedOrganization()).toBe('cred-org-1');
    });

    it('prefers temporary credential org over saved when activeMethod is credentials', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        credentials: {
          saved: {
            accessKeyId: 'A',
            secretAccessKey: 'S',
            endpoint: 'https://e.com',
            organizationId: 'saved-org',
          },
          temporary: {
            accessKeyId: 'T',
            secretAccessKey: 'TS',
            endpoint: 'https://t.com',
            organizationId: 'temp-org',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      expect(storage.getSelectedOrganization()).toBe('temp-org');
    });

    it('returns null when no method is active', async () => {
      writeRawConfig({ version: 2 });
      const storage = await import('../../src/auth/storage.js');
      expect(storage.getSelectedOrganization()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getCredentials priority: env > temporary > saved
  // ---------------------------------------------------------------------------
  describe('getCredentials', () => {
    it('returns temporary over saved', async () => {
      writeRawConfig({
        version: 2,
        credentials: {
          saved: {
            accessKeyId: 'SAVED',
            secretAccessKey: 'S',
            endpoint: 'https://s.com',
          },
          temporary: {
            accessKeyId: 'TEMP',
            secretAccessKey: 'T',
            endpoint: 'https://t.com',
          },
        },
      });

      const provider = await import('../../src/auth/provider.js');
      expect(provider.getCredentials()?.accessKeyId).toBe('TEMP');
    });

    it('falls back to saved when no temporary', async () => {
      writeRawConfig({
        version: 2,
        credentials: {
          saved: {
            accessKeyId: 'SAVED',
            secretAccessKey: 'S',
            endpoint: 'https://s.com',
          },
        },
      });

      const provider = await import('../../src/auth/provider.js');
      expect(provider.getCredentials()?.accessKeyId).toBe('SAVED');
    });

    it('returns null when no credentials exist', async () => {
      writeRawConfig({ version: 2 });
      const provider = await import('../../src/auth/provider.js');
      expect(provider.getCredentials()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // clearAllData preserves credentials.saved
  // ---------------------------------------------------------------------------
  describe('clearAllData', () => {
    it('preserves saved credentials', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        oauth: {
          tokens: { accessToken: 't', expiresAt: 1 },
          organizations: [{ id: 'org-1', name: 'Org' }],
          selectedOrganization: 'org-1',
        },
        credentials: {
          saved: {
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            endpoint: 'https://e.com',
            organizationId: 'org-1',
          },
          temporary: {
            accessKeyId: 'TMP',
            secretAccessKey: 'TMP-S',
            endpoint: 'https://t.com',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearAllData();

      // Saved creds should survive
      const raw = readRawConfig() as Record<string, unknown>;
      const creds = raw['credentials'] as Record<string, unknown>;
      expect(creds['saved']).toBeDefined();
      const saved = creds['saved'] as Record<string, unknown>;
      expect(saved['accessKeyId']).toBe('AKID');

      // Temporary should be gone
      expect(creds['temporary']).toBeUndefined();

      // OAuth should be gone
      expect(raw['oauth']).toBeUndefined();

      // activeMethod should be gone
      expect(raw['activeMethod']).toBeUndefined();
    });

    it('works when no saved credentials exist', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'oauth',
        oauth: {
          tokens: { accessToken: 't', expiresAt: 1 },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearAllData();

      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['version']).toBe(2);
      expect(raw['oauth']).toBeUndefined();
      expect(raw['credentials']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // storeCredentialOrganization
  // ---------------------------------------------------------------------------
  describe('storeCredentialOrganization', () => {
    it('writes to temporary slot when it exists', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        credentials: {
          saved: {
            accessKeyId: 'S-AK',
            secretAccessKey: 'S-SK',
            endpoint: 'https://s.com',
          },
          temporary: {
            accessKeyId: 'T-AK',
            secretAccessKey: 'T-SK',
            endpoint: 'https://t.com',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.storeCredentialOrganization('my-org');

      const raw = readRawConfig() as Record<string, unknown>;
      const creds = raw['credentials'] as Record<string, unknown>;
      const temp = creds['temporary'] as Record<string, unknown>;
      const saved = creds['saved'] as Record<string, unknown>;

      expect(temp['organizationId']).toBe('my-org');
      // Saved should NOT have been modified
      expect(saved['organizationId']).toBeUndefined();
    });

    it('writes to saved slot when no temporary exists', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        credentials: {
          saved: {
            accessKeyId: 'S-AK',
            secretAccessKey: 'S-SK',
            endpoint: 'https://s.com',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.storeCredentialOrganization('saved-org');

      const raw = readRawConfig() as Record<string, unknown>;
      const creds = raw['credentials'] as Record<string, unknown>;
      const saved = creds['saved'] as Record<string, unknown>;

      expect(saved['organizationId']).toBe('saved-org');
    });

    it('does nothing when no credential slots exist', async () => {
      writeRawConfig({ version: 2 });

      const storage = await import('../../src/auth/storage.js');
      await storage.storeCredentialOrganization('org-id');

      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['credentials']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // clearTemporaryCredentials
  // ---------------------------------------------------------------------------
  describe('clearTemporaryCredentials', () => {
    it('removes temporary credentials while preserving saved', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        credentials: {
          saved: {
            accessKeyId: 'SAVED',
            secretAccessKey: 'S',
            endpoint: 'https://s.com',
          },
          temporary: {
            accessKeyId: 'TEMP',
            secretAccessKey: 'T',
            endpoint: 'https://t.com',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearTemporaryCredentials();

      const raw = readRawConfig() as Record<string, unknown>;
      const creds = raw['credentials'] as Record<string, unknown>;
      expect(creds['saved']).toBeDefined();
      expect(creds['temporary']).toBeUndefined();
    });

    it('does nothing when no credentials exist', async () => {
      writeRawConfig({ version: 2 });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearTemporaryCredentials();

      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['version']).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // clearOAuthData
  // ---------------------------------------------------------------------------
  describe('clearOAuthData', () => {
    it('removes OAuth data and clears activeMethod when it is oauth', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'oauth',
        oauth: {
          tokens: { accessToken: 't', expiresAt: 1 },
          organizations: [{ id: 'org-1', name: 'Org' }],
          selectedOrganization: 'org-1',
        },
        credentials: {
          saved: {
            accessKeyId: 'SAVED',
            secretAccessKey: 'S',
            endpoint: 'https://s.com',
          },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearOAuthData();

      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['oauth']).toBeUndefined();
      expect(raw['credentials']).toBeDefined();
      expect(raw['activeMethod']).toBeUndefined();
    });

    it('preserves activeMethod when it is not oauth', async () => {
      writeRawConfig({
        version: 2,
        activeMethod: 'credentials',
        oauth: {
          tokens: { accessToken: 't', expiresAt: 1 },
        },
      });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearOAuthData();

      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['oauth']).toBeUndefined();
      expect(raw['activeMethod']).toBe('credentials');
    });

    it('does nothing when no OAuth data exists', async () => {
      writeRawConfig({ version: 2 });

      const storage = await import('../../src/auth/storage.js');
      await storage.clearOAuthData();

      const raw = readRawConfig() as Record<string, unknown>;
      expect(raw['version']).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // storeLoginMethod / getLoginMethod
  // ---------------------------------------------------------------------------
  describe('storeLoginMethod / getLoginMethod', () => {
    it('stores and retrieves login method', async () => {
      writeRawConfig({ version: 2 });

      const storage = await import('../../src/auth/storage.js');
      expect(storage.getLoginMethod()).toBeNull();

      await storage.storeLoginMethod('oauth');
      expect(storage.getLoginMethod()).toBe('oauth');
    });
  });
});
