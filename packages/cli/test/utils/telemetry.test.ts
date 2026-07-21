import { describe, expect, it } from 'vitest';

import {
  beforeSend,
  invocationFlags,
  redactSecrets,
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

describe('invocationFlags', () => {
  it('keeps flag names and drops positionals (bucket names, keys, paths)', () => {
    expect(
      invocationFlags([
        'cp',
        './private.txt',
        't3://bucket/customer-data/key',
        '--format',
        'json',
      ])
    ).toEqual(['--format']);
  });

  it('strips the value from --flag=value', () => {
    expect(invocationFlags(['stat', '--region=us-east-1'])).toEqual([
      '--region',
    ]);
  });

  it('drops values that follow a flag (space form)', () => {
    // 'user@example.com' is a positional value, not a flag → dropped entirely.
    expect(
      invocationFlags(['login', '--username', 'user@example.com'])
    ).toEqual(['--username']);
  });

  it('keeps short flags and returns empty when there are none', () => {
    expect(invocationFlags(['buckets', 'create', 'my-bucket', '-y'])).toEqual([
      '-y',
    ]);
    expect(invocationFlags(['ls', 't3://bucket/secret-prefix'])).toEqual([]);
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
