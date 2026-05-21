---
'@tigrisdata/storage': minor
---

Add fork listing and snapshot deletion, and expand bucket listing fields:

- New `listForks(sourceBucketName?)` returns every bucket that forks from the given source as `ForkedBucket[]` (name, creation date, fork timestamp, source snapshot, snapshot creation date).
- New `deleteBucketSnapshot(sourceBucketName, snapshotVersion)` deletes a specific snapshot version of a bucket.
- `listBuckets` and `getStats` now return additional bucket metadata: `regions`, `type` (`Regular` | `Snapshot`), and `visibility` (`public` | `private`).
