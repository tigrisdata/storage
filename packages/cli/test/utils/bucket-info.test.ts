import { describe, expect, it } from 'vitest';

import { buildBucketInfo } from '../../src/utils/bucket-info.js';

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    isSnapshotEnabled: false,
    forkInfo: undefined,
    regions: [],
    locations: { type: 'global' },
    sizeInfo: {
      numberOfObjects: 10,
      size: 1024,
      numberOfObjectsAllVersions: 15,
    },
    settings: {
      defaultTier: 'STANDARD',
      deleteProtection: false,
      softDelete: { enabled: false },
      allowObjectAcl: false,
      corsRules: [],
      customDomain: undefined,
      additionalHeaders: undefined,
      lifecycleRules: undefined,
      ttlConfig: undefined,
      notifications: undefined,
      dataMigration: undefined,
    },
    ...overrides,
  } as Parameters<typeof buildBucketInfo>[0];
}

function findValue(
  info: { label: string; value: string }[],
  label: string
): string | undefined {
  return info.find((i) => i.label === label)?.value;
}

describe('buildBucketInfo', () => {
  describe('base fields', () => {
    it('returns all base fields', () => {
      const info = buildBucketInfo(makeResponse());
      const labels = info.map((i) => i.label);
      expect(labels).toContain('Number of Objects');
      expect(labels).toContain('Total Size');
      expect(labels).toContain('All Versions Count');
      expect(labels).toContain('Default Tier');
      expect(labels).toContain('Locations');
      expect(labels).toContain('Snapshots Enabled');
      expect(labels).toContain('Delete Protection');
      expect(labels).toContain('Soft Delete');
      expect(labels).toContain('Allow Object ACL');
      expect(labels).toContain('Custom Domain');
      expect(labels).toContain('Has Forks');
    });

    it('formats number of objects', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Number of Objects')).toBe('10');
    });

    it('uses N/A when numberOfObjects is undefined', () => {
      const info = buildBucketInfo(
        makeResponse({ sizeInfo: { size: 0, numberOfObjectsAllVersions: 0 } })
      );
      expect(findValue(info, 'Number of Objects')).toBe('N/A');
    });

    it('uses N/A when size is undefined', () => {
      const info = buildBucketInfo(
        makeResponse({ sizeInfo: { numberOfObjects: 0 } })
      );
      expect(findValue(info, 'Total Size')).toBe('N/A');
    });

    it('formats size when defined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Total Size')).toBe('1.0 KB');
    });

    it('uses N/A when numberOfObjectsAllVersions is undefined', () => {
      const info = buildBucketInfo(
        makeResponse({ sizeInfo: { numberOfObjects: 0, size: 0 } })
      );
      expect(findValue(info, 'All Versions Count')).toBe('N/A');
    });

    it('shows custom domain as None when undefined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Custom Domain')).toBe('None');
    });

    it('shows custom domain when defined', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            customDomain: 'cdn.example.com',
          },
        })
      );
      expect(findValue(info, 'Custom Domain')).toBe('cdn.example.com');
    });

    it('shows boolean fields as Yes/No', () => {
      const info = buildBucketInfo(
        makeResponse({
          isSnapshotEnabled: true,
          settings: {
            ...makeResponse().settings,
            deleteProtection: true,
            allowObjectAcl: true,
          },
        })
      );
      expect(findValue(info, 'Snapshots Enabled')).toBe('Yes');
      expect(findValue(info, 'Delete Protection')).toBe('Yes');
      expect(findValue(info, 'Allow Object ACL')).toBe('Yes');
    });
  });

  describe('locations', () => {
    it('shows Global for a global bucket', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Locations')).toBe('Global');
    });

    it('shows the region code for a single-region bucket', () => {
      const info = buildBucketInfo(
        makeResponse({ locations: { type: 'single', values: 'iad' } })
      );
      expect(findValue(info, 'Locations')).toBe('iad');
    });

    it('labels a multi-region bucket', () => {
      const info = buildBucketInfo(
        makeResponse({ locations: { type: 'multi', values: 'usa' } })
      );
      expect(findValue(info, 'Locations')).toBe('Multi-region (usa)');
    });

    it('joins values for a dual-region bucket', () => {
      const info = buildBucketInfo(
        makeResponse({ locations: { type: 'dual', values: ['ams', 'fra'] } })
      );
      expect(findValue(info, 'Locations')).toBe('Dual region (ams, fra)');
    });
  });

  describe('soft delete', () => {
    it('shows Disabled when soft delete is off', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Soft Delete')).toBe('Disabled');
    });

    it('shows retention days when soft delete is enabled', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            softDelete: { enabled: true, retentionDays: 30 },
          },
        })
      );
      expect(findValue(info, 'Soft Delete')).toBe('Enabled (30 day retention)');
    });
  });

  describe('additional headers', () => {
    it('does not add the row when undefined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Additional Headers')).toBeUndefined();
    });

    it('formats the header when present', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            additionalHeaders: { 'X-Content-Type-Options': 'nosniff' },
          },
        })
      );
      expect(findValue(info, 'Additional Headers')).toBe(
        'X-Content-Type-Options: nosniff'
      );
    });
  });

  describe('fork info', () => {
    it('shows Has Forks as No when forkInfo is undefined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Has Forks')).toBe('No');
    });

    it('shows Has Forks as Yes when hasChildren is true', () => {
      const info = buildBucketInfo(
        makeResponse({ forkInfo: { hasChildren: true, parents: [] } })
      );
      expect(findValue(info, 'Has Forks')).toBe('Yes');
    });

    it('adds Forked From and Fork Snapshot when parents exist', () => {
      const info = buildBucketInfo(
        makeResponse({
          forkInfo: {
            hasChildren: false,
            parents: [{ bucketName: 'parent-bucket', snapshot: 'snap-123' }],
          },
        })
      );
      expect(findValue(info, 'Forked From')).toBe('parent-bucket');
      expect(findValue(info, 'Fork Snapshot')).toBe('snap-123');
    });

    it('does not add fork fields when parents is empty', () => {
      const info = buildBucketInfo(
        makeResponse({ forkInfo: { hasChildren: false, parents: [] } })
      );
      expect(findValue(info, 'Forked From')).toBeUndefined();
    });
  });

  describe('lifecycle rules', () => {
    it('does not add lifecycle rules when undefined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Lifecycle Rules')).toBeUndefined();
    });

    it('does not add lifecycle rules when empty', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: { ...makeResponse().settings, lifecycleRules: [] },
        })
      );
      expect(findValue(info, 'Lifecycle Rules')).toBeUndefined();
    });

    it('formats rule with storage class and days', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            lifecycleRules: [
              { storageClass: 'GLACIER', days: 90, enabled: true },
            ],
          },
        })
      );
      expect(findValue(info, 'Lifecycle Rules')).toBe('GLACIER after 90d');
    });

    it('marks disabled rules', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            lifecycleRules: [
              { storageClass: 'GLACIER', days: 90, enabled: false },
            ],
          },
        })
      );
      expect(findValue(info, 'Lifecycle Rules')).toBe(
        'GLACIER after 90d (disabled)'
      );
    });

    it('joins multiple rules with commas', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            lifecycleRules: [
              { storageClass: 'STANDARD_IA', days: 30, enabled: true },
              { storageClass: 'GLACIER', days: 90, enabled: true },
            ],
          },
        })
      );
      expect(findValue(info, 'Lifecycle Rules')).toBe(
        'STANDARD_IA after 30d, GLACIER after 90d'
      );
    });

    it('renders TTL-shaped rules (expiration only) alongside transitions', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            lifecycleRules: [
              { id: 'ttl-1', expiration: { days: 7 }, enabled: true },
              {
                id: 'lc-1',
                storageClass: 'GLACIER',
                days: 90,
                enabled: true,
              },
            ],
          },
        })
      );
      expect(findValue(info, 'TTL')).toBeUndefined();
      expect(findValue(info, 'Lifecycle Rules')).toBe(
        'expire after 7d, GLACIER after 90d'
      );
    });
  });

  describe('CORS rules', () => {
    it('does not add CORS when empty', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'CORS Rules')).toBeUndefined();
    });

    it('shows rule count when corsRules has entries', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            corsRules: [{}, {}],
          },
        })
      );
      expect(findValue(info, 'CORS Rules')).toBe('2 rule(s)');
    });
  });

  describe('notifications', () => {
    it('does not add notifications when undefined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Notifications')).toBeUndefined();
    });

    it('shows Enabled when notifications.enabled is not false', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            notifications: { enabled: true },
          },
        })
      );
      expect(findValue(info, 'Notifications')).toBe('Enabled');
    });

    it('shows Enabled when notifications.enabled is undefined', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: { ...makeResponse().settings, notifications: {} },
        })
      );
      expect(findValue(info, 'Notifications')).toBe('Enabled');
    });

    it('shows Disabled when notifications.enabled is false', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            notifications: { enabled: false },
          },
        })
      );
      expect(findValue(info, 'Notifications')).toBe('Disabled');
    });
  });

  describe('data migration', () => {
    it('does not add data migration when undefined', () => {
      const info = buildBucketInfo(makeResponse());
      expect(findValue(info, 'Data Migration')).toBeUndefined();
    });

    it('shows name and endpoint when both present', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            dataMigration: { name: 'aws-s3', endpoint: 's3.amazonaws.com' },
          },
        })
      );
      expect(findValue(info, 'Data Migration')).toBe(
        'aws-s3 (s3.amazonaws.com)'
      );
    });

    it('shows name when endpoint is absent', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            dataMigration: { name: 'aws-s3' },
          },
        })
      );
      expect(findValue(info, 'Data Migration')).toBe('aws-s3');
    });

    it('shows Configured when both name and endpoint are absent', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: { ...makeResponse().settings, dataMigration: {} },
        })
      );
      expect(findValue(info, 'Data Migration')).toBe('Configured');
    });

    it('shows N/A for name when only endpoint is present', () => {
      const info = buildBucketInfo(
        makeResponse({
          settings: {
            ...makeResponse().settings,
            dataMigration: { endpoint: 's3.amazonaws.com' },
          },
        })
      );
      expect(findValue(info, 'Data Migration')).toBe('N/A (s3.amazonaws.com)');
    });
  });
});
