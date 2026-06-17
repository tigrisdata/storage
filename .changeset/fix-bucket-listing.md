---
'@tigrisdata/storage': minor
---

Fix bucket-listing pagination and enrich `listForks` results.

- **Pagination fix**: `fetchBucketListing` now sends the gateway's expected `continuation-token` and `max-buckets` query params (previously `ContinuationToken`/`MaxBuckets`) and reads the `ContinuationToken` field from the response (previously the non-existent `NextContinuationToken`/`IsTruncated` pair). This repairs pagination for `listBuckets`, `listForks`, and `getStats`, which previously could drop the continuation token or ignore the requested page size.
- **`listForks` now resolves forks through the shared listing endpoint** and returns full `Bucket` fields plus fork info (`forkInfo.parents` with the parent bucket, fork-creation time, and source snapshot).
- **Restored backward compatibility**: `ForkedBucket` is exported again, and each returned fork carries the `forkCreatedAt`, `snapshot`, and `snapshotCreatedAt` fields that were dropped in the previous `listForks` rework. These are deprecated in favor of `forkInfo.parents[0]`.
