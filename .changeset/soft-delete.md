---
'@tigrisdata/storage': minor
---

Add bucket soft-delete support.

- `updateBucket(name, options)` accepts `softDelete: { enabled: true; retentionDays: number } | { enabled: false }` to configure recoverable bucket deletion.
- `getBucketInfo(name)` returns `settings.softDelete` with the same discriminated shape.
- `listBuckets({ deleted: true })` lists soft-deleted buckets, and each `Bucket` now carries `softDeleteInfo` when soft delete is enabled.
- `restoreBucket(name, options)` recovers a soft-deleted bucket within its retention window.

The `enableDeleteProtection` option on `updateBucket` and the `deleteProtection` field on `getBucketInfo` are deprecated in favor of `softDelete`.
