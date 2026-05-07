import { describe, expect, it, vi } from 'vitest';
import type { BucketLifecycleRule, BucketTtl } from '../types';
import { buildLifecycleRules } from './lifecycle';

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

  describe('Lifecycle transition - toggle only (no storageClass/days/date)', () => {
    it('returns error when toggling enabled: false but no existing rule', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe('No existing lifecycle rule found to update');
      expect(rules).toBeUndefined();
    });

    it('returns error when toggling enabled: true but no existing rule', () => {
      const { error } = buildLifecycleRules(
        {},
        { lifecycleRules: [{ enabled: true }] }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe('No existing lifecycle rule found to update');
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
    it('returns both rules when TTL and a transition rule exist', () => {
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

  describe('expiration on a lifecycle rule', () => {
    it('emits transition + expiration on the same rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER',
              days: 30,
              expiration: { days: 365 },
            },
          ],
        }
      );
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        transitions: [{ storage_class: 'GLACIER', days: 30 }],
        expiration: { days: 365, enabled: true },
        status: 1,
      });
    });

    it('emits transition + expiration + filter on the same rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER',
              days: 30,
              expiration: { days: 365 },
              filter: { prefix: 'logs/' },
            },
          ],
        }
      );
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        transitions: [{ storage_class: 'GLACIER', days: 30 }],
        expiration: { days: 365, enabled: true },
        filter: { prefix: 'logs/' },
        status: 1,
      });
    });

    it('emits expiration-only rule (no transition)', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              expiration: { days: 90 },
              filter: { prefix: 'tmp/' },
            },
          ],
        }
      );
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        expiration: { days: 90, enabled: true },
        filter: { prefix: 'tmp/' },
        status: 1,
      });
      expect(rules![0]).not.toHaveProperty('transitions');
    });

    it('emits expiration with date instead of days', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER',
              days: 30,
              expiration: { date: '2026-12-31' },
            },
          ],
        }
      );
      expect(rules![0].expiration).toEqual({
        date: '2026-12-31',
        enabled: true,
      });
    });

    it('preserves existing expiration on toggle-only update', () => {
      const existing: BucketLifecycleRule = {
        id: 'rule-1',
        enabled: true,
        storageClass: 'GLACIER',
        days: 30,
        expiration: { days: 365 },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existing] },
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(rules![0]).toEqual({
        id: 'rule-1',
        transitions: [{ storage_class: 'GLACIER', days: 30 }],
        expiration: { days: 365, enabled: false },
        status: 2,
      });
    });

    it('replaces expiration when update provides one', () => {
      const existing: BucketLifecycleRule = {
        id: 'rule-1',
        enabled: true,
        storageClass: 'GLACIER',
        days: 30,
        expiration: { days: 365 },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existing] },
        { lifecycleRules: [{ expiration: { days: 30 } }] }
      );
      expect(rules![0].expiration).toEqual({ days: 30, enabled: true });
    });

    it('switches expiration from days to date', () => {
      const existing: BucketLifecycleRule = {
        id: 'rule-1',
        enabled: true,
        storageClass: 'GLACIER',
        days: 30,
        expiration: { days: 365 },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existing] },
        { lifecycleRules: [{ expiration: { date: '2026-12-31' } }] }
      );
      expect(rules![0].expiration).toEqual({
        date: '2026-12-31',
        enabled: true,
      });
      expect(rules![0].expiration).not.toHaveProperty('days');
    });

    it('omits expiration when neither update nor existing has one', () => {
      const { rules } = buildLifecycleRules(
        {},
        { lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }] }
      );
      expect(rules![0]).not.toHaveProperty('expiration');
    });
  });

  describe('filter (prefix)', () => {
    it('emits filter.prefix on a new rule', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER',
              days: 90,
              filter: { prefix: 'logs/' },
            },
          ],
        }
      );
      expect(rules![0]).toEqual({
        id: 'test-uuid-0000',
        transitions: [{ storage_class: 'GLACIER', days: 90 }],
        filter: { prefix: 'logs/' },
        status: 1,
      });
    });

    it('preserves existing filter on toggle-only update', () => {
      const existingFiltered: BucketLifecycleRule = {
        id: 'filtered-existing',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
        filter: { prefix: 'logs/' },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingFiltered] },
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(rules![0]).toEqual({
        id: 'filtered-existing',
        transitions: [{ storage_class: 'GLACIER', days: 90 }],
        filter: { prefix: 'logs/' },
        status: 2,
      });
    });

    it('updates filter while preserving existing transition', () => {
      const existingFiltered: BucketLifecycleRule = {
        id: 'filtered-existing',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
        filter: { prefix: 'old/' },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingFiltered] },
        { lifecycleRules: [{ filter: { prefix: 'new/' } }] }
      );
      expect(rules![0].id).toBe('filtered-existing');
      expect(rules![0].filter).toEqual({ prefix: 'new/' });
      expect(rules![0].transitions).toEqual([
        { storage_class: 'GLACIER', days: 90 },
      ]);
    });

    it('omits filter when neither update nor existing has one', () => {
      const { rules } = buildLifecycleRules(
        {},
        { lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }] }
      );
      expect(rules![0]).not.toHaveProperty('filter');
    });

    it('returns error for filter-only update when no existing rule', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        { lifecycleRules: [{ filter: { prefix: 'logs/' } }] }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe('No existing lifecycle rule found to update');
      expect(rules).toBeUndefined();
    });
  });

  describe('multiple lifecycle rules', () => {
    it('emits all update rules when no existing rules', () => {
      const { rules } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER',
              days: 30,
              expiration: { days: 365 },
              filter: { prefix: 'logs/' },
            },
            {
              storageClass: 'GLACIER_IR',
              days: 7,
              filter: { prefix: 'tmp/' },
            },
          ],
        }
      );
      expect(rules).toHaveLength(2);
      expect(rules![0].filter).toEqual({ prefix: 'logs/' });
      expect(rules![0].expiration).toEqual({ days: 365, enabled: true });
      expect(rules![1].filter).toEqual({ prefix: 'tmp/' });
      expect(rules![1]).not.toHaveProperty('expiration');
    });

    it('matches update rules to existing rules by id', () => {
      const existingA: BucketLifecycleRule = {
        id: 'rule-a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
        filter: { prefix: 'logs/' },
      };
      const existingB: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
        filter: { prefix: 'images/' },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingA, existingB] },
        {
          lifecycleRules: [
            { id: 'rule-b', enabled: false },
            { id: 'rule-a', filter: { prefix: 'archive/' } },
          ],
        }
      );
      expect(rules).toHaveLength(2);

      const a = rules!.find((r) => r.id === 'rule-a');
      expect(a!.filter).toEqual({ prefix: 'archive/' });
      expect(a!.transitions).toEqual([{ storage_class: 'GLACIER', days: 90 }]);
      expect(a!.status).toBe(1);

      const b = rules!.find((r) => r.id === 'rule-b');
      expect(b!.filter).toEqual({ prefix: 'images/' });
      expect(b!.transitions).toEqual([
        { storage_class: 'STANDARD_IA', days: 30 },
      ]);
      expect(b!.status).toBe(2);
    });

    it('preserves existing rules whose id is not referenced in update', () => {
      const existingA: BucketLifecycleRule = {
        id: 'rule-a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const existingB: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingA, existingB] },
        { lifecycleRules: [{ id: 'rule-a', enabled: false }] }
      );
      expect(rules).toHaveLength(2);
      expect(rules!.find((r) => r.id === 'rule-a')!.status).toBe(2);
      expect(rules!.find((r) => r.id === 'rule-b')!.status).toBe(1);
    });

    it('treats a no-id update rule as new when multiple existing rules', () => {
      const existingA: BucketLifecycleRule = {
        id: 'rule-a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const existingB: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingA, existingB] },
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER_IR',
              days: 7,
              filter: { prefix: 'tmp/' },
            },
          ],
        }
      );
      expect(rules).toHaveLength(3);
      const newRule = rules!.find(
        (r) => r.transitions?.[0].storage_class === 'GLACIER_IR'
      );
      expect(newRule!.id).toBe('test-uuid-0000');
      expect(newRule!.filter).toEqual({ prefix: 'tmp/' });
    });

    it('errors when a no-id update rule has no content and multiple existing rules', () => {
      const existingA: BucketLifecycleRule = {
        id: 'rule-a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const existingB: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules, error } = buildLifecycleRules(
        { lifecycleRules: [existingA, existingB] },
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe('No existing lifecycle rule found to update');
      expect(rules).toBeUndefined();
    });

    it('preserves all existing rules when no update provided', () => {
      const existingA: BucketLifecycleRule = {
        id: 'rule-a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const existingB: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: false,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingA, existingB] },
        {}
      );
      expect(rules).toHaveLength(2);
      expect(rules!.find((r) => r.id === 'rule-a')!.status).toBe(1);
      expect(rules!.find((r) => r.id === 'rule-b')!.status).toBe(2);
    });

    it('preserves TTL alongside multiple lifecycle rules', () => {
      const existingA: BucketLifecycleRule = {
        id: 'rule-a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
        filter: { prefix: 'logs/' },
      };
      const existingB: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
        filter: { prefix: 'images/' },
      };
      const { rules } = buildLifecycleRules(
        {
          ttlConfig: ttlConfig(),
          lifecycleRules: [existingA, existingB],
        },
        { lifecycleRules: [{ id: 'rule-a', enabled: false }] }
      );
      expect(rules).toHaveLength(3);
      expect(rules!.find((r) => r.expiration && !r.transitions)).toBeDefined();
    });
  });

  describe('auto-match shape compatibility', () => {
    it('does not auto-match a no-id transition update into a TTL-only existing rule', () => {
      // Bucket has a single TTL-only rule. A no-id transition update
      // must NOT silently merge into it; it should be emitted as a new rule.
      const existingTtlOnly: BucketLifecycleRule = {
        id: 'ttl-existing',
        enabled: true,
        expiration: { days: 30 },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingTtlOnly] },
        { lifecycleRules: [{ storageClass: 'GLACIER', days: 90 }] }
      );
      expect(rules).toHaveLength(2);

      const ttl = rules!.find((r) => r.id === 'ttl-existing');
      expect(ttl).toEqual({
        id: 'ttl-existing',
        expiration: { days: 30, enabled: true },
        status: 1,
      });
      expect(ttl).not.toHaveProperty('transitions');

      const transitionRule = rules!.find((r) => r.id !== 'ttl-existing');
      expect(transitionRule!.transitions).toEqual([
        { storage_class: 'GLACIER', days: 90 },
      ]);
      expect(transitionRule).not.toHaveProperty('expiration');
    });

    it('does not auto-match a no-id expiration update into a transition-only existing rule', () => {
      const existingTransitionOnly: BucketLifecycleRule = {
        id: 'transition-existing',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingTransitionOnly] },
        { lifecycleRules: [{ expiration: { days: 365 } }] }
      );
      expect(rules).toHaveLength(2);
      const original = rules!.find((r) => r.id === 'transition-existing');
      expect(original).not.toHaveProperty('expiration');
      const newRule = rules!.find((r) => r.id !== 'transition-existing');
      expect(newRule!.expiration).toEqual({ days: 365, enabled: true });
    });

    it('still auto-matches a transition update when existing has a transition', () => {
      // Back-compat: single transition update + single transition existing.
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [lifecycleRule()] },
        { lifecycleRules: [{ storageClass: 'STANDARD_IA', days: 60 }] }
      );
      expect(rules).toHaveLength(1);
      expect(rules![0].id).toBe('transition-existing');
      expect(rules![0].transitions).toEqual([
        { storage_class: 'STANDARD_IA', days: 60 },
      ]);
    });

    it('still auto-matches a toggle-only update against any single existing rule', () => {
      const existingTtlOnly: BucketLifecycleRule = {
        id: 'ttl-existing',
        enabled: true,
        expiration: { days: 30 },
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [existingTtlOnly] },
        { lifecycleRules: [{ enabled: false }] }
      );
      expect(rules).toHaveLength(1);
      expect(rules![0]).toEqual({
        id: 'ttl-existing',
        expiration: { days: 30, enabled: false },
        status: 2,
      });
    });

    it('auto-matches a no-id transition update past a TTL-only sibling', () => {
      // Bucket has [TTL-only, transition]. A no-id transition update
      // should auto-match the only shape-compatible existing rule.
      const ttl: BucketLifecycleRule = {
        id: 'ttl-existing',
        enabled: true,
        expiration: { days: 30 },
      };
      const transition: BucketLifecycleRule = {
        id: 'transition-existing',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [ttl, transition] },
        { lifecycleRules: [{ storageClass: 'STANDARD_IA', days: 60 }] }
      );
      expect(rules).toHaveLength(2);
      const merged = rules!.find((r) => r.id === 'transition-existing');
      expect(merged!.transitions).toEqual([
        { storage_class: 'STANDARD_IA', days: 60 },
      ]);
      expect(rules!.find((r) => r.id === 'ttl-existing')).toBeDefined();
    });

    it('skips auto-match when multiple shape-compatible existing rules exist', () => {
      const a: BucketLifecycleRule = {
        id: 'a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const b: BucketLifecycleRule = {
        id: 'b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [a, b] },
        { lifecycleRules: [{ storageClass: 'GLACIER_IR', days: 7 }] }
      );
      expect(rules).toHaveLength(3);
      expect(rules!.find((r) => r.id === 'a')!.transitions).toEqual([
        { storage_class: 'GLACIER', days: 90 },
      ]);
      expect(rules!.find((r) => r.id === 'b')!.transitions).toEqual([
        { storage_class: 'STANDARD_IA', days: 30 },
      ]);
    });
  });

  describe('idless rule preservation', () => {
    it('preserves an idless existing rule when an unrelated rule is updated', () => {
      const idless: BucketLifecycleRule = {
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
        filter: { prefix: 'logs/' },
      };
      const withId: BucketLifecycleRule = {
        id: 'rule-b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules } = buildLifecycleRules(
        { lifecycleRules: [idless, withId] },
        { lifecycleRules: [{ id: 'rule-b', enabled: false }] }
      );
      expect(rules).toHaveLength(2);
      const preserved = rules!.find(
        (r) => r.transitions?.[0].storage_class === 'GLACIER'
      );
      expect(preserved).toBeDefined();
      expect(preserved!.filter).toEqual({ prefix: 'logs/' });
    });
  });

  describe('built-rule completeness', () => {
    it('errors when a transition update lacks a time field and no auto-match available', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        { lifecycleRules: [{ storageClass: 'GLACIER' }] }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe(
        'Lifecycle transition requires either `days` or `date`'
      );
      expect(rules).toBeUndefined();
    });

    it('errors when a no-id, no-storageClass update has no auto-match', () => {
      // Two existing rules → no auto-match. Update has only `days`,
      // no storageClass → resolveTransition returns undefined.
      const a: BucketLifecycleRule = {
        id: 'a',
        enabled: true,
        storageClass: 'GLACIER',
        days: 90,
      };
      const b: BucketLifecycleRule = {
        id: 'b',
        enabled: true,
        storageClass: 'STANDARD_IA',
        days: 30,
      };
      const { rules, error } = buildLifecycleRules(
        { lifecycleRules: [a, b] },
        { lifecycleRules: [{ days: 7 }] }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe(
        'Lifecycle transition requires `storageClass`'
      );
      expect(rules).toBeUndefined();
    });

    it('errors when transition fields are set with expiration but no storageClass and no merge available', () => {
      // Without this guard, `resolveTransition` would silently return
      // undefined, the rule would pass `validateBuiltRule` on the strength
      // of its expiration, and the caller's `days: 30` would be dropped.
      const { rules, error } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              days: 30,
              expiration: { days: 365 },
            },
          ],
        }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe(
        'Lifecycle transition requires `storageClass`'
      );
      expect(rules).toBeUndefined();
    });

    it('errors when expiration update has no days or date', () => {
      const { rules, error } = buildLifecycleRules(
        {},
        {
          lifecycleRules: [
            {
              storageClass: 'GLACIER',
              days: 30,
              expiration: {},
            },
          ],
        }
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toBe(
        'Lifecycle expiration requires either `days` or `date`'
      );
      expect(rules).toBeUndefined();
    });
  });
});
