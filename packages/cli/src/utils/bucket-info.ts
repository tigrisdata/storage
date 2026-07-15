import type {
  BucketInfoResponse,
  BucketLifecycleRule,
} from '@tigrisdata/storage';

import { formatSize } from './format.js';
import { formatLocations } from './locations.js';

/**
 * Human-readable description of a rule's transition, or undefined if
 * the rule has no transition target. Used by both the bucket-info
 * "Lifecycle Rules" row and the lifecycle-list table cell.
 */
export function describeTransition(
  rule: BucketLifecycleRule
): string | undefined {
  if (!rule.storageClass) return undefined;
  if (rule.days !== undefined)
    return `${rule.storageClass} after ${rule.days}d`;
  if (rule.date !== undefined) return `${rule.storageClass} on ${rule.date}`;
  return rule.storageClass;
}

/**
 * Human-readable description of a rule's expiration, or undefined if
 * the rule has no expiration. Used by both the bucket-info "Lifecycle
 * Rules" row and the lifecycle-list table cell.
 */
export function describeExpiration(
  rule: BucketLifecycleRule
): string | undefined {
  if (!rule.expiration) return undefined;
  if (rule.expiration.days !== undefined) return `${rule.expiration.days}d`;
  if (rule.expiration.date !== undefined) return rule.expiration.date;
  return undefined;
}

function formatLifecycleRule(rule: BucketLifecycleRule): string {
  const parts: string[] = [];

  const transition = describeTransition(rule);
  if (transition) parts.push(transition);

  const expiration = describeExpiration(rule);
  if (expiration) {
    // bucket-info shows expiration with the "expire" prefix; the table
    // cell version drops it because the column header already says
    // "Expiration".
    parts.push(
      rule.expiration?.days !== undefined
        ? `expire after ${expiration}`
        : `expire on ${expiration}`
    );
  }

  const annotations: string[] = [];
  if (rule.filter?.prefix) annotations.push(`prefix=${rule.filter.prefix}`);
  if (rule.enabled === false) annotations.push('disabled');

  const head = parts.join(', ');
  return annotations.length > 0 ? `${head} (${annotations.join(', ')})` : head;
}

export function buildBucketInfo(data: BucketInfoResponse) {
  const info: { label: string; value: string }[] = [
    {
      label: 'Number of Objects',
      value: data.sizeInfo.numberOfObjects?.toString() ?? 'N/A',
    },
    {
      label: 'Total Size',
      value:
        data.sizeInfo.size !== undefined
          ? formatSize(data.sizeInfo.size)
          : 'N/A',
    },
    {
      label: 'All Versions Count',
      value: data.sizeInfo.numberOfObjectsAllVersions?.toString() ?? 'N/A',
    },
    { label: 'Default Tier', value: data.settings.defaultTier },
    { label: 'Locations', value: formatLocations(data.locations) },
    {
      label: 'Snapshots Enabled',
      value: data.isSnapshotEnabled ? 'Yes' : 'No',
    },
    {
      label: 'Delete Protection',
      // deleteProtection is deprecated in favor of softDelete (shown below),
      // but kept here so existing output isn't dropped.
      value: data.settings.deleteProtection ? 'Yes' : 'No',
    },
    {
      label: 'Soft Delete',
      value: data.settings.softDelete.enabled
        ? `Enabled (${data.settings.softDelete.retentionDays} day retention)`
        : 'Disabled',
    },
    {
      label: 'Allow Object ACL',
      value: data.settings.allowObjectAcl ? 'Yes' : 'No',
    },
    {
      label: 'Custom Domain',
      value: data.settings.customDomain ?? 'None',
    },
    {
      label: 'Has Forks',
      value: data.forkInfo?.hasChildren ? 'Yes' : 'No',
    },
  ];

  if (data.forkInfo?.parents?.length) {
    info.push({
      label: 'Forked From',
      value: data.forkInfo.parents[0].bucketName,
    });
    info.push({
      label: 'Fork Snapshot',
      value: data.forkInfo.parents[0].snapshot,
    });
  }

  if (data.settings.lifecycleRules?.length) {
    info.push({
      label: 'Lifecycle Rules',
      value: data.settings.lifecycleRules
        .map((r) => formatLifecycleRule(r))
        .join(', '),
    });
  }

  if (data.settings.additionalHeaders) {
    info.push({
      label: 'Additional Headers',
      value: Object.entries(data.settings.additionalHeaders)
        .map(([key, val]) => `${key}: ${val}`)
        .join(', '),
    });
  }

  if (data.settings.corsRules.length) {
    info.push({
      label: 'CORS Rules',
      value: `${data.settings.corsRules.length} rule(s)`,
    });
  }

  if (data.settings.notifications) {
    info.push({
      label: 'Notifications',
      value:
        data.settings.notifications.enabled !== false ? 'Enabled' : 'Disabled',
    });
  }

  if (data.settings.dataMigration) {
    info.push({
      label: 'Data Migration',
      value: data.settings.dataMigration.endpoint
        ? `${data.settings.dataMigration.name ?? 'N/A'} (${data.settings.dataMigration.endpoint})`
        : (data.settings.dataMigration.name ?? 'Configured'),
    });
  }

  return info;
}
