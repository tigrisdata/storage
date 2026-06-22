---
'@tigrisdata/storage': minor
---

Add `setBucketType`, `enableSnapshot`, and `disableSnapshot` to change a bucket's type (regular vs snapshot) after creation.

- `setBucketType(bucketName, type, options?)` sets the bucket type to `BucketTypes.Regular` or `BucketTypes.Snapshot`.
- `enableSnapshot(bucketName, options?)` switches a bucket to a snapshot bucket.
- `disableSnapshot(bucketName, options?)` switches it back to a regular bucket. It is rejected with an error when the bucket still has dependent forks, since a snapshot parent cannot become regular while forks depend on it.

Also exports the `BucketTypes` enum and the `SetBucketTypeOptions` / `BucketSnapshotOptions` option types.

```ts
import { setBucketType, BucketTypes, enableSnapshot } from '@tigrisdata/storage';

await setBucketType('my-bucket', BucketTypes.Snapshot);
await enableSnapshot('my-bucket');
```
