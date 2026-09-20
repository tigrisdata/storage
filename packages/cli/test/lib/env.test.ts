import { describe, expect, it } from 'vitest';

import { envVars, renderEnv } from '../../src/lib/env.js';

const creds = {
  accessKeyId: 'tid_AaBb',
  secretAccessKey: 'tsec_XxYy',
  endpoint: 'https://t3.storage.dev',
  iamEndpoint: 'https://iam.storageapi.dev',
};

describe('envVars', () => {
  it('names the five variables the AWS SDKs and CLI read, in order', () => {
    expect(Object.entries(envVars(creds, false))).toEqual([
      ['AWS_ACCESS_KEY_ID', 'tid_AaBb'],
      ['AWS_SECRET_ACCESS_KEY', 'tsec_XxYy'],
      ['AWS_ENDPOINT_URL_S3', 'https://t3.storage.dev'],
      ['AWS_ENDPOINT_URL_IAM', 'https://iam.storageapi.dev'],
      ['AWS_REGION', 'auto'],
    ]);
  });

  it('names the TIGRIS_STORAGE_* variables the Tigris SDKs read', () => {
    expect(envVars(creds, true)).toEqual({
      TIGRIS_STORAGE_ACCESS_KEY_ID: 'tid_AaBb',
      TIGRIS_STORAGE_SECRET_ACCESS_KEY: 'tsec_XxYy',
      TIGRIS_STORAGE_ENDPOINT: 'https://t3.storage.dev',
    });
  });

  it('keeps a custom endpoint', () => {
    const vars = envVars(
      { ...creds, endpoint: 'https://custom.endpoint.dev' },
      false
    );
    expect(vars.AWS_ENDPOINT_URL_S3).toBe('https://custom.endpoint.dev');
  });
});

describe('renderEnv', () => {
  const vars = { A: 'plain', B: "it's" };

  it('prints POSIX exports that survive eval', () => {
    expect(renderEnv(vars, 'shell', 'sh')).toBe(
      "export A='plain'\nexport B='it'\\''s'\n"
    );
  });

  it('prints fish assignments', () => {
    expect(renderEnv(vars, 'shell', 'fish')).toBe(
      "set -gx A 'plain'\nset -gx B 'it\\'s'\n"
    );
  });

  it('prints PowerShell assignments', () => {
    expect(renderEnv(vars, 'shell', 'powershell')).toBe(
      "$env:A = 'plain'\n$env:B = 'it''s'\n"
    );
  });

  it('prints dotenv lines, quoting only when it has to', () => {
    expect(
      renderEnv({ A: 'https://t3.storage.dev', B: 'two words' }, 'dotenv')
    ).toBe('A=https://t3.storage.dev\nB="two words"\n');
  });

  it('prints json', () => {
    expect(JSON.parse(renderEnv(vars, 'json'))).toEqual(vars);
  });

  it('always ends with a newline, so the last line is a complete command', () => {
    for (const format of ['shell', 'dotenv', 'json'] as const) {
      expect(renderEnv(vars, format).endsWith('\n')).toBe(true);
    }
  });
});
