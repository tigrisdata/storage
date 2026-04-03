import type { AccessKey } from '@tigrisdata/iam';
import { describe, expect, it } from 'vitest';

import { keyMatchesOperation } from '../../src/lib/presign.js';

function makeKey(
  roles: AccessKey['roles'] = [],
  overrides: Partial<AccessKey> = {}
): AccessKey {
  return {
    id: 'tid_test',
    name: 'test-key',
    createdAt: new Date(),
    status: 'active',
    roles,
    ...overrides,
  };
}

describe('keyMatchesOperation', () => {
  describe('get method', () => {
    it('matches Editor on target bucket', () => {
      const key = makeKey([{ bucket: 'my-bucket', role: 'Editor' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(true);
    });

    it('matches ReadOnly on target bucket', () => {
      const key = makeKey([{ bucket: 'my-bucket', role: 'ReadOnly' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(true);
    });

    it('matches Editor on wildcard bucket', () => {
      const key = makeKey([{ bucket: '*', role: 'Editor' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(true);
    });

    it('matches ReadOnly on wildcard bucket', () => {
      const key = makeKey([{ bucket: '*', role: 'ReadOnly' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(true);
    });

    it('does not match Editor on different bucket', () => {
      const key = makeKey([{ bucket: 'other-bucket', role: 'Editor' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(false);
    });
  });

  describe('put method', () => {
    it('matches Editor on target bucket', () => {
      const key = makeKey([{ bucket: 'my-bucket', role: 'Editor' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'put')).toBe(true);
    });

    it('does not match ReadOnly on target bucket', () => {
      const key = makeKey([{ bucket: 'my-bucket', role: 'ReadOnly' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'put')).toBe(false);
    });

    it('matches Editor on wildcard bucket', () => {
      const key = makeKey([{ bucket: '*', role: 'Editor' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'put')).toBe(true);
    });

    it('does not match ReadOnly on wildcard bucket', () => {
      const key = makeKey([{ bucket: '*', role: 'ReadOnly' }]);
      expect(keyMatchesOperation(key, 'my-bucket', 'put')).toBe(false);
    });
  });

  describe('NamespaceAdmin', () => {
    it('matches for get regardless of bucket', () => {
      const key = makeKey([{ bucket: '*', role: 'NamespaceAdmin' }]);
      expect(keyMatchesOperation(key, 'any-bucket', 'get')).toBe(true);
    });

    it('matches for put regardless of bucket', () => {
      const key = makeKey([{ bucket: '*', role: 'NamespaceAdmin' }]);
      expect(keyMatchesOperation(key, 'any-bucket', 'put')).toBe(true);
    });

    it('matches even with a specific bucket value', () => {
      const key = makeKey([{ bucket: 'some-bucket', role: 'NamespaceAdmin' }]);
      expect(keyMatchesOperation(key, 'other-bucket', 'get')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns false when roles is undefined', () => {
      const key = makeKey(undefined);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(false);
    });

    it('returns false when roles is empty', () => {
      const key = makeKey([]);
      expect(keyMatchesOperation(key, 'my-bucket', 'get')).toBe(false);
    });

    it('matches if any role satisfies the operation', () => {
      const key = makeKey([
        { bucket: 'other-bucket', role: 'ReadOnly' },
        { bucket: 'my-bucket', role: 'Editor' },
      ]);
      expect(keyMatchesOperation(key, 'my-bucket', 'put')).toBe(true);
    });

    it('does not match when no role satisfies the operation', () => {
      const key = makeKey([
        { bucket: 'other-bucket', role: 'Editor' },
        { bucket: 'my-bucket', role: 'ReadOnly' },
      ]);
      expect(keyMatchesOperation(key, 'my-bucket', 'put')).toBe(false);
    });
  });
});
