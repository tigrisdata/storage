---
'@tigrisdata/storage': patch
---

Remove the `forkSnapshot` option from `mergeFork`. `mergeFork(forkName, sourceBucketName, options?)` now always merges from the fork's current state, and the `X-Tigris-Merge-Source-Bucket-Snapshot` header is no longer sent.
