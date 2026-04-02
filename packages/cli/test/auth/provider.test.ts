import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
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

// Mock fromIni — avoid real AWS credential resolution
vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni:
    ({ profile }: { profile: string }) =>
    async () => ({
      accessKeyId: `${profile}-access-key`,
      secretAccessKey: `${profile}-secret-key`,
    }),
}));

// Mock auth client — provider.ts calls getAuth0Config() at module level
vi.mock('@auth/client.js', () => ({
  getAuth0Config: () => ({
    domain: 'test.auth0.com',
    clientId: 'test-client-id',
    audience: 'test-audience',
  }),
  getAuthClient: () => ({}),
}));

function writeRawConfig(data: unknown): void {
  mkdirSync(join(tempHome, '.tigris'), { recursive: true });
  writeFileSync(
    join(tempHome, '.tigris', 'config.json'),
    JSON.stringify(data, null, 2)
  );
}

function createAwsFiles(): void {
  const awsDir = join(tempHome, '.aws');
  mkdirSync(awsDir, { recursive: true });
  writeFileSync(join(awsDir, 'credentials'), '[default]\n');
}

// Env vars that affect auth resolution
const ENV_KEYS = [
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ENDPOINT_URL_S3',
  'TIGRIS_STORAGE_ACCESS_KEY_ID',
  'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  'TIGRIS_STORAGE_ENDPOINT',
];

describe('resolveAuthMethod', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'tigris-test-'));
    vi.resetModules();
    // Save and clear env vars that interfere with auth resolution
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    // Restore env vars
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  // -------------------------------------------------------------------------
  // Individual method detection
  // -------------------------------------------------------------------------

  it('returns none when nothing is configured', async () => {
    writeRawConfig({ version: 2 });
    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('none');
  });

  it('returns aws-profile when AWS_PROFILE is set and .aws files exist', async () => {
    writeRawConfig({ version: 2 });
    createAwsFiles();
    process.env.AWS_PROFILE = 'my-profile';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    expect(method).toEqual({
      type: 'aws-profile',
      profile: 'my-profile',
      accessKeyId: 'my-profile-access-key',
      secretAccessKey: 'my-profile-secret-key',
    });
  });

  it('returns oauth when activeMethod is oauth', async () => {
    writeRawConfig({ version: 2, activeMethod: 'oauth' });
    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method).toEqual({ type: 'oauth' });
  });

  it('returns credentials when activeMethod is credentials with stored creds', async () => {
    writeRawConfig({
      version: 2,
      activeMethod: 'credentials',
      credentials: {
        temporary: {
          accessKeyId: 'TEMP-AK',
          secretAccessKey: 'TEMP-SK',
          endpoint: 'https://t.com',
        },
      },
    });

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    expect(method).toEqual({
      type: 'credentials',
      accessKeyId: 'TEMP-AK',
      secretAccessKey: 'TEMP-SK',
    });
  });

  it('returns environment with tigris source for TIGRIS_ env vars', async () => {
    writeRawConfig({ version: 2 });
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID = 'TIG-AK';
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY = 'TIG-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    expect(method).toEqual({
      type: 'environment',
      accessKeyId: 'TIG-AK',
      secretAccessKey: 'TIG-SK',
      source: 'tigris',
    });
  });

  it('returns environment with aws source for AWS_ env vars', async () => {
    writeRawConfig({ version: 2 });
    process.env.AWS_ACCESS_KEY_ID = 'AWS-AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'AWS-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    expect(method).toEqual({
      type: 'environment',
      accessKeyId: 'AWS-AK',
      secretAccessKey: 'AWS-SK',
      source: 'aws',
    });
  });

  it('returns configured when only saved credentials exist (no activeMethod)', async () => {
    writeRawConfig({
      version: 2,
      credentials: {
        saved: {
          accessKeyId: 'SAVED-AK',
          secretAccessKey: 'SAVED-SK',
          endpoint: 'https://s.com',
        },
      },
    });

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    expect(method).toEqual({
      type: 'configured',
      accessKeyId: 'SAVED-AK',
      secretAccessKey: 'SAVED-SK',
    });
  });

  // -------------------------------------------------------------------------
  // Priority ordering
  // -------------------------------------------------------------------------

  it('aws-profile takes priority over env vars', async () => {
    writeRawConfig({ version: 2 });
    createAwsFiles();
    process.env.AWS_PROFILE = 'prof';
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID = 'TIG-AK';
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY = 'TIG-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('aws-profile');
  });

  it('aws-profile takes priority over oauth login', async () => {
    writeRawConfig({ version: 2, activeMethod: 'oauth' });
    createAwsFiles();
    process.env.AWS_PROFILE = 'prof';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('aws-profile');
  });

  it('env vars take priority over oauth login', async () => {
    writeRawConfig({ version: 2, activeMethod: 'oauth' });
    process.env.AWS_ACCESS_KEY_ID = 'AWS-AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'AWS-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('environment');
  });

  it('env vars take priority over credentials login', async () => {
    writeRawConfig({
      version: 2,
      activeMethod: 'credentials',
      credentials: {
        temporary: {
          accessKeyId: 'CRED-AK',
          secretAccessKey: 'CRED-SK',
          endpoint: 'https://c.com',
        },
      },
    });
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID = 'TIG-AK';
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY = 'TIG-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('environment');
  });

  it('oauth takes priority over credentials login', async () => {
    writeRawConfig({
      version: 2,
      activeMethod: 'oauth',
      credentials: {
        temporary: {
          accessKeyId: 'CRED-AK',
          secretAccessKey: 'CRED-SK',
          endpoint: 'https://c.com',
        },
      },
    });

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('oauth');
  });

  it('env vars take priority over configured credentials', async () => {
    writeRawConfig({
      version: 2,
      credentials: {
        saved: {
          accessKeyId: 'SAVED-AK',
          secretAccessKey: 'SAVED-SK',
          endpoint: 'https://s.com',
        },
      },
    });
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID = 'TIG-AK';
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY = 'TIG-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('environment');
  });

  // -------------------------------------------------------------------------
  // Edge cases / fallthrough
  // -------------------------------------------------------------------------

  it('credentials login with no stored creds falls through to configured', async () => {
    writeRawConfig({
      version: 2,
      activeMethod: 'credentials',
      credentials: {
        // Only saved (from configure), no temporary (from login)
        saved: {
          accessKeyId: 'CFG-AK',
          secretAccessKey: 'CFG-SK',
          endpoint: 'https://cfg.com',
        },
      },
    });

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    // getStoredCredentials returns saved, so credentials login picks it up
    expect(method.type).toBe('credentials');
    if (method.type === 'credentials') {
      expect(method.accessKeyId).toBe('CFG-AK');
    }
  });

  it('ignores AWS_PROFILE when .aws directory has no files', async () => {
    writeRawConfig({ version: 2, activeMethod: 'oauth' });
    // Set AWS_PROFILE but don't create .aws/ files
    process.env.AWS_PROFILE = 'orphan-profile';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('oauth');
  });

  it('ignores incomplete TIGRIS_ env vars (missing secret)', async () => {
    writeRawConfig({ version: 2 });
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID = 'TIG-AK';
    // No TIGRIS_STORAGE_SECRET_ACCESS_KEY

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('none');
  });

  it('ignores incomplete AWS_ env vars (missing secret)', async () => {
    writeRawConfig({ version: 2 });
    process.env.AWS_ACCESS_KEY_ID = 'AWS-AK';
    // No AWS_SECRET_ACCESS_KEY

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();
    expect(method.type).toBe('none');
  });

  it('AWS_ env vars take priority over TIGRIS_ env vars', async () => {
    writeRawConfig({ version: 2 });
    process.env.TIGRIS_STORAGE_ACCESS_KEY_ID = 'TIG-AK';
    process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY = 'TIG-SK';
    process.env.AWS_ACCESS_KEY_ID = 'AWS-AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'AWS-SK';

    const { resolveAuthMethod } = await import('../../src/auth/provider.js');
    const method = await resolveAuthMethod();

    expect(method).toEqual({
      type: 'environment',
      accessKeyId: 'AWS-AK',
      secretAccessKey: 'AWS-SK',
      source: 'aws',
    });
  });
});
