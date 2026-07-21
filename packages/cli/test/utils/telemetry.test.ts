import { describe, expect, it } from 'vitest';

import {
  beforeSend,
  invocationCommand,
  redactSecrets,
  scrubArgv,
} from '../../src/utils/telemetry.js';

describe('redactSecrets', () => {
  it('redacts a JWT mid-string without injecting the match offset', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    // Exact match: a group-less pattern must emit '[redacted]', never
    // '<offset>[redacted]' from the replacer's offset argument.
    expect(redactSecrets(`token is ${jwt} here`)).toBe(
      'token is [redacted] here'
    );
    expect(redactSecrets(jwt)).toBe('[redacted]');
  });

  it('redacts Bearer authorization values (exact, mid-string)', () => {
    expect(redactSecrets('Authorization: Bearer abc123.def-456_ghi')).toBe(
      'Authorization: [redacted]'
    );
  });

  it('redacts AWS-style access key ids (exact, mid-string)', () => {
    expect(redactSecrets('key AKIAIOSFODNN7EXAMPLE failed')).toBe(
      'key [redacted] failed'
    );
  });

  it('redacts email addresses (PII), including inside object keys', () => {
    expect(redactSecrets('invite alice@example.com now')).toBe(
      'invite [redacted] now'
    );
    expect(redactSecrets('t3://bucket/users/bob@corp.io/data')).toBe(
      't3://bucket/users/[redacted]/data'
    );
  });

  it('redacts Tigris access-key ids and secrets (tid_/tsec_)', () => {
    expect(redactSecrets('key tid_AaBb secret tsec_XxYy')).toBe(
      'key [redacted] secret [redacted]'
    );
  });

  it('redacts the value in secret=value / secret: value forms', () => {
    expect(redactSecrets('secret-access-key=SsUpErSeCrEt123')).toBe(
      'secret-access-key=[redacted]'
    );
    expect(redactSecrets('password: hunter2')).toBe('password: [redacted]');
    expect(redactSecrets('token="tok_abc123"')).toContain('[redacted]');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Failed to get stats for bucket my-bucket: Invalid path';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('scrubArgv', () => {
  it('redacts credential flag values (space and = forms)', () => {
    expect(
      scrubArgv([
        'configure',
        '--access-key',
        'tid_AaBb',
        '--access-secret',
        'tsec_XxYy',
      ])
    ).toEqual([
      'configure',
      '--access-key',
      '[redacted]',
      '--access-secret',
      '[redacted]',
    ]);
    expect(scrubArgv(['login', '--access-secret=tsec_XxYy'])).toEqual([
      'login',
      '--access-secret=[redacted]',
    ]);
  });

  it('redacts PII flag values (name/username)', () => {
    expect(
      scrubArgv(['iam', 'teams', 'create', '--name', 'Alice Smith'])
    ).toEqual(['iam', 'teams', 'create', '--name', '[redacted]']);
  });

  it('redacts emails/keys in positionals but keeps buckets and paths', () => {
    expect(
      scrubArgv([
        'cp',
        './report.pdf',
        't3://my-bucket/customer/report.pdf',
        '--format',
        'json',
      ])
    ).toEqual([
      'cp',
      './report.pdf',
      't3://my-bucket/customer/report.pdf',
      '--format',
      'json',
    ]);
    expect(scrubArgv(['iam', 'users', 'invite', 'alice@example.com'])).toEqual([
      'iam',
      'users',
      'invite',
      '[redacted]',
    ]);
  });

  it('keeps non-sensitive flags and their values', () => {
    expect(
      scrubArgv(['buckets', 'create', 'my-bucket', '--region', 'iad'])
    ).toEqual(['buckets', 'create', 'my-bucket', '--region', 'iad']);
  });

  it('scrubs a secret value in a non-sensitive --flag=value without touching the next arg', () => {
    // The value is a secret: redact it, and do NOT redact the next positional.
    expect(scrubArgv(['mk', '--note=tsec_realSecretAAA', 'my-bucket'])).toEqual(
      ['mk', '--note=[redacted]', 'my-bucket']
    );
    // A sensitive substring in a non-secret value must not redact the next arg.
    expect(scrubArgv(['mk', '--label=api-key-x', 'keep-this-bucket'])).toEqual([
      'mk',
      '--label=api-key-x',
      'keep-this-bucket',
    ]);
  });
});

describe('invocationCommand', () => {
  it('returns the top-level command name', () => {
    expect(invocationCommand(['buckets', 'create', 'my-bucket'])).toBe(
      'buckets'
    );
    expect(invocationCommand(['stat', 't3://b/k'])).toBe('stat');
  });

  it('returns undefined when the first arg is a flag or missing', () => {
    expect(invocationCommand(['--version'])).toBeUndefined();
    expect(invocationCommand([])).toBeUndefined();
  });
});

describe('beforeSend', () => {
  it('drops the machine hostname', () => {
    const event = beforeSend({ server_name: 'my-laptop.local' });
    expect(event.server_name).toBeUndefined();
  });

  it('redacts secrets in exception values, message, and breadcrumbs', () => {
    const event = beforeSend({
      message: 'failed with token=tok_supersecret',
      exception: {
        values: [{ value: 'Auth failed: Bearer abc123.def456' }],
      },
      breadcrumbs: [
        { message: 'ran configure --secret-access-key=SsUpErSeCrEt' },
      ],
    });

    expect(event.message).toContain('[redacted]');
    expect(event.message).not.toContain('tok_supersecret');
    expect(event.exception?.values?.[0].value).toContain('[redacted]');
    expect(event.exception?.values?.[0].value).not.toContain('abc123.def456');
    expect(event.breadcrumbs?.[0].message).toContain('[redacted]');
    expect(event.breadcrumbs?.[0].message).not.toContain('SsUpErSeCrEt');
  });

  it('handles an event with no secrets or optional fields', () => {
    const event = beforeSend({
      exception: { values: [{ value: 'Invalid path' }] },
    });
    expect(event.exception?.values?.[0].value).toBe('Invalid path');
  });
});
