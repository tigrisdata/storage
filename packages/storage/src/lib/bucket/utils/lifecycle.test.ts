import { describe, it, expect, vi } from 'vitest';
import { buildLifecycleRules } from './lifecycle';
import type { BucketTtl, BucketLifecycleRule } from '../types';

// Stable UUID for snapshot assertions
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-0000',
});

// -- Helpers --

const ttlConfig = (overrides?: Partial<BucketTtl>): BucketTtl => ({
  id: 'ttl-existing',
  enabled: true,
  days: 30,
  ...overrides,
});

const lifecycleRule = (
  overrides?: Partial<BucketLifecycleRule>
): BucketLifecycleRule => ({
  id: 'transition-existing',
  enabled: true,
  storageClass: 'GLACIER',
  days: 90,
  ...overrides,
});

// -- Tests --

describe('buildLifecycleRules', () => {
  describe('empty state', () => {
    it('returns undefined when no existing rules and no update', () => {
      const { rules, error } = buildLifecycleRules({}, {});
      expect(error).toBeUndefined();
      expect(rules).toBeUndefined();
    });

    it('returns undefined when update fields are explicitly undefined', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        {
          ttlConfig: undefined,
          lifecycleRules: undefined,
        }
      );
      expect(error).toBeUndefined();
      expect(rules).toBeUndefined();
    });
  });

  describe('TTL - creating new', () => {
    it('creates a new TTL rule with days', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        {
          ttlConfig: { days: 30 },
        }
      );
      expect(error).toBeUndefined();
      expect(rules).toHaveLength(1);
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        expiration: { days: 30, enabled: true },
        status: 1,
      });
    });

    it('creates a new TTL rule with date', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        {
          ttlConfig: { date: '2026-12-31' },
        }
      );
      expect(error).toBeUndefined();
      expect(rules).toHaveLength(1);
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        expiration: { date: '2026-12-31', enabled: true },
        status: 1,
      });
    });

    it('defaults to enabled: true for new TTL rule when enabled is not specified', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          ttlConfig: { days: 7 },
        }
      );
      expect(rules![0].expiration!.enabled).toBe(true);
      expect(rules![0].status).toBe(1);
    });

    it('respects enabled: false for new TTL rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          ttlConfig: { enabled: false, days: 7 },
        }
      );
      expect(rules![0].expiration!.enabled).toBe(false);
      expect(rules![0].status).toBe(2);
    });

    it('generates a new ID when no existing rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          ttlConfig: { days: 10 },
        }
      );
      expect(rules![0].id).toBe('test-uuid-0000');
    });
  });

  describe('TTL - updating existing', () => {
    it('preserves existing ID when updating TTL', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig() },
        { ttlConfig: { days: 60 } }
      );
      expect(rules![0].id).toBe('ttl-existing');
    });

    it('updates days on existing TTL rule', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig({ days: 30 }) },
        { ttlConfig: { days: 60 } }
      );
      expect(rules![0].expiration).toEqual({ days: 60, enabled: true });
    });

    it('switches from days to date and removes days', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig({ days: 30, date: undefined }) },
        { ttlConfig: { date: '2026-06-01' } }
      );
      expect(rules![0].expiration).toEqual({
        date: '2026-06-01',
        enabled: true,
      });
      expect(rules![0].expiration).not.toHaveProperty('days');
    });

    it('switches from date to days and removes date', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig({ date: '2026-06-01', days: undefined }) },
        { ttlConfig: { days: 14 } }
      );
      expect(rules![0].expiration).toEqual({ days: 14, enabled: true });
      expect(rules![0].expiration).not.toHaveProperty('date');
    });
  });

  describe('TTL - toggle only (no days/date)', () => {
    it('disables existing TTL and preserves days', () => {
      const { rules, error } = buildLifecycleRules(
        { ttlConfig: ttlConfig({ days: 30, enabled: true }) },
        { ttlConfig: { enabled: false } }
      );
      expect(error).toBeUndefined();
      expect(rules![0]).toEqual({
        id: 'ttl-existing',
        expiration: { days: 30, enabled: false },
        status: 2,
      });
    });

    it('disables existing TTL and preserves date', () => {
      const { rules } = buildLifecycleRules(
        {
          ttlConfig: ttlConfig({
            date: '2026-12-31',
            days: undefined,
            enabled: true,
          }),
        },
        { ttlConfig: { enabled: false } }
      );
      expect(rules![0].expiration).toEqual({
        date: '2026-12-31',
        enabled: false,
      });
    });

    it('enables existing disabled TTL and preserves days', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig({ days: 30, enabled: false }) },
        { ttlConfig: { enabled: true } }
      );
      expect(rules![0]).toEqual({
        id: 'ttl-existing',
        expiration: { days: 30, enabled: true },
        status: 1,
      });
    });

    it('returns error when toggling TTL but no existing rule', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        {
          ttlConfig: { enabled: false },
        }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe(
        'No existing TTL configuration found to update'
      );
      expect(rules).toBeUndefined();
    });

    it('returns error when toggling enabled: true but no existing rule', () => {
      const { error } = buildLifecycleRules(
        {},
        {
          ttlConfig: { enabled: true },
        }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe(
        'No existing TTL configuration found to update'
      );
    });
  });

  describe('TTL - preserving existing when not updating', () => {
    it('preserves existing TTL rule when only updating lifecycle', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig({ days: 30, enabled: true }) },
        { lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }] }
      );
      const ttl = rules!.find((r) => r.expiration !== undefined);
      expect(ttl).toEqual({
        id: 'ttl-existing',
        expiration: { days: 30, enabled: true },
        status: 1,
      });
    });

    it('preserves existing TTL when no update provided', () => {
      const { rules } = buildLifecycleRules(
        {
          ttlConfig: ttlConfig({
            date: '2026-06-01',
            days: undefined,
            enabled: false,
          }),
        },
        {}
      );
      expect(rules).toHaveLength(1);
      expect(rules![0].expiration).toEqual({
        date: '2026-06-01',
        enabled: false,
      });
      expect(rules![0].status).toBe(2);
    });
  });

  describe('Lifecycle transition - creating new', () => {
    it('creates a new transition rule with days', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }],
        }
      );
      expect(error).toBeUndefined();
      expect(rules).toHaveLength(1);
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        transitions: [{ storage_class: 'GLACIER', days: 90 }],
        status: 1,
      });
    });

    it('creates a new transition rule with date', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [{ storageClass: 'GLACIER_IR', date: '2026-12-31' }],
        }
      );
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        transitions: [{ storage_class: 'GLACIER_IR', date: '2026-12-31' }],
        status: 1,
      });
    });

    it('defaults to enabled: true for new transition rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [{ storageClass: 'STANDARD_IA', days: 30 }],
        }
      );
      expect(rules![0].status).toBe(1);
    });

    it('respects enabled: false for new transition rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            { enabled: false, storageClass: 'GLACIER', days: 90 },
          ],
        }
      );
      expect(rules![0].status).toBe(2);
    });
  });

  describe('Lifecycle transition - updating existing', () => {
    it('preserves existing ID when updating transition', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule()] },
        { lifecycleRules: [{ storageClass: 'STANDARD_IA', days: 60 }] }
      );
      expect(rules![0].id).toBe('transition-existing');
    });

    it('updates storage class on existing transition', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule()] },
        { lifecycleRules: [{ storageClass: 'STANDARD_IA' }] }
      );
      expect(rules![0].transitions![0].storage_class).toBe('STANDARD_IA');
    });

    it('falls back to existing storage class when not provided', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule()] },
        { lifecycleRules: [{ days: 120 }] }
      );
      expect(rules![0].transitions![0].storage_class).toBe('GLACIER');
      expect(rules![0].transitions![0].days).toBe(120);
    });

    it('switches from days to date and removes days', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule({ days: 90, date: undefined })] },
        { lifecycleRules: [{ date: '2026-06-01' }] }
      );
      expect(rules![0].transitions![0]).not.toHaveProperty('days');
      expect(rules![0].transitions![0].date).toBe('2026-06-01');
    });

    it('switches from date to days and removes date', () => {
      const { rules } = buildLifecycleRules(
        {
          lifecycleRules: [
            lifecycleRule({ date: '2026-06-01', days: undefined }),
          ],
        },
        { lifecycleRules: [{ days: 60 }] }
      );
      expect(rules![0].transitions![0]).not.toHaveProperty('date');
      expect(rules![0].transitions![0].days).toBe(60);
    });

    it('preserves existing days when only updating enabled', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule({ days: 90, enabled: true })] },
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(rules![0].transitions![0].days).toBe(90);
      expect(rules![0].transitions![0].storage_class).toBe('GLACIER');
      expect(rules![0].status).toBe(2);
    });

    it('preserves existing date when only updating enabled', () => {
      const { rules } = buildLifecycleRules(
        {
          lifecycleRules: [
            lifecycleRule({
              date: '2026-12-31',
              days: undefined,
              enabled: true,
            }),
          ],
        },
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(rules![0].transitions![0].date).toBe('2026-12-31');
      expect(rules![0].status).toBe(2);
    });
  });

  describe('Lifecycle transition - preserving existing when not updating', () => {
    it('preserves existing transition when only updating TTL', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule()] },
        { ttlConfig: { days: 7 } }
      );
      const transition = rules!.find((r) => r.transitions !== undefined);
      expect(transition).toEqual({
        id: 'transition-existing',
        transitions: [{ storage_class: 'GLACIER', days: 90 }],
        status: 1,
      });
    });

    it('preserves existing transition when no update provided', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule({ enabled: false })] },
        {}
      );
      expect(rules).toHaveLength(1);
      expect(rules![0].status).toBe(2);
      expect(rules![0].transitions![0].storage_class).toBe('GLACIER');
    });
  });

  describe('combined TTL + transition', () => {
    it('returns max 2 rules when both TTL and transition exist', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig(), lifecycleRules: [lifecycleRule()] },
        {}
      );
      expect(rules).toHaveLength(2);
    });

    it('creates both TTL and transition from scratch', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          ttlConfig: { days: 30 },
          lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }],
        }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0].expiration).toBeDefined();
      expect(rules![1].transitions).toBeDefined();
    });

    it('updates TTL while preserving existing transition', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig(), lifecycleRules: [lifecycleRule()] },
        { ttlConfig: { days: 60 } }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0]).toEqual({
        id: 'ttl-existing',
        expiration: { days: 60, enabled: true },
        status: 1,
      });
      expect(rules![1]).toEqual({
        id: 'transition-existing',
        transitions: [{ storage_class: 'GLACIER', days: 90 }],
        status: 1,
      });
    });

    it('updates transition while preserving existing TTL', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig(), lifecycleRules: [lifecycleRule()] },
        { lifecycleRules: [{ storageClass: 'STANDARD_IA', days: 60 }] }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0]).toEqual({
        id: 'ttl-existing',
        expiration: { days: 30, enabled: true },
        status: 1,
      });
      expect(rules![1]).toEqual({
        id: 'transition-existing',
        transitions: [{ storage_class: 'STANDARD_IA', days: 60 }],
        status: 1,
      });
    });

    it('updates both TTL and transition simultaneously', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig(), lifecycleRules: [lifecycleRule()] },
        {
          ttlConfig: { days: 14 },
          lifecycleRules: [{ storageClass: 'GLACIER_IR', days: 30 }],
        }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0].expiration!.days).toBe(14);
      expect(rules![1].transitions![0].storage_class).toBe('GLACIER_IR');
      expect(rules![1].transitions![0].days).toBe(30);
    });

    it('adds new TTL alongside existing transition', () => {
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule()] },
        { ttlConfig: { days: 7 } }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0].expiration).toBeDefined();
      expect(rules![1].transitions).toBeDefined();
      expect(rules![1].id).toBe('transition-existing');
    });

    it('adds new transition alongside existing TTL', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig() },
        { lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }] }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0].id).toBe('ttl-existing');
      expect(rules![1].transitions).toBeDefined();
    });
  });

  describe('only first lifecycle rule is used', () => {
    it('ignores additional lifecycle rules beyond the first', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            { storageClass: 'GLACIER', days: 90 },
            { storageClass: 'STANDARD_IA', days: 30 },
          ],
        }
      );
      expect(rules).toHaveLength(1);
      expect(rules![0].transitions![0].storage_class).toBe('GLACIER');
    });
  });

  describe('empty lifecycle rules array', () => {
    it('does not create a transition rule from empty array', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [],
        }
      );
      expect(rules).toBeUndefined();
    });

    it('preserves existing TTL when lifecycle rules array is empty', () => {
      const { rules } = buildLifecycleRules(
        { ttlConfig: ttlConfig() },
        { lifecycleRules: [] }
      );
      expect(rules).toHaveLength(1);
      expect(rules![0].expiration).toBeDefined();
    });
  });
});
