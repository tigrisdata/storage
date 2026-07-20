import { describe, expect, it } from 'vitest';

import {
  beforeSend,
  redactSecrets,
  scrubArgv,
} from '../../src/utils/telemetry.js';

describe('redactSecrets', () => {
  it('redacts JWT / opaque bearer tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = redactSecrets(`token is ${jwt} here`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('[redacted]');
  });

  it('redacts Bearer authorization values', () => {
    const out = redactSecrets('Authorization: Bearer abc123.def-456_ghi');
    expect(out).not.toContain('abc123.def-456_ghi');
    expect(out).toContain('[redacted]');
  });

  it('redacts AWS-style access key ids', () => {
    const out = redactSecrets('key AKIAIOSFODNN7EXAMPLE failed');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).toContain('[redacted]');
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
  it('redacts the value after a credential flag (space form)', () => {
    expect(
      scrubArgv(['configure', '--secret-access-key', 'SsUpErSeCrEt'])
    ).toEqual(['configure', '--secret-access-key', '[redacted]']);
  });

  it('redacts the value in the --flag=value form', () => {
    expect(scrubArgv(['configure', '--token=abc123xyz'])).toEqual([
      'configure',
      '--token=[redacted]',
    ]);
  });

  it('preserves non-secret flags and positionals', () => {
    expect(
      scrubArgv(['cp', './file.txt', 't3://bucket/key', '--format', 'json'])
    ).toEqual(['cp', './file.txt', 't3://bucket/key', '--format', 'json']);
  });

  it('redacts a secret-looking token even without a flag', () => {
    const out = scrubArgv(['login', 'Bearer sk_live_deadbeefcafe']);
    expect(out[1]).not.toContain('sk_live_deadbeefcafe');
    expect(out[1]).toContain('[redacted]');
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
