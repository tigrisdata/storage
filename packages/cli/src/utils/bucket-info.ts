import type { BucketInfoResponse } from '@tigrisdata/storage';
import { formatSize } from './format.js';

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
    {
      label: 'Snapshots Enabled',
      value: data.isSnapshotEnabled ? 'Yes' : 'No',
    },
    {
      label: 'Delete Protection',
      value: data.settings.deleteProtection ? 'Yes' : 'No',
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

  if (data.settings.ttlConfig) {
    info.push({
      label: 'TTL',
      value: data.settings.ttlConfig.enabled
        ? data.settings.ttlConfig.days
          ? `${data.settings.ttlConfig.days} days`
          : (data.settings.ttlConfig.date ?? 'Enabled')
        : 'Disabled',
    });
  }

  if (data.settings.lifecycleRules?.length) {
    info.push({
      label: 'Lifecycle Rules',
      value: data.settings.lifecycleRules
        .map(
          (r) =>
            `${r.storageClass}${r.days ? ` after ${r.days}d` : ''}${r.enabled ? '' : ' (disabled)'}`
        )
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
