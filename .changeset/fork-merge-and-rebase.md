---
'@tigrisdata/storage': minor
---

Add `mergeFork` and `rebaseFork` for managing bucket forks.

- `mergeFork(forkName, sourceBucketName, options?)` merges a fork's changes back into its parent source bucket. The gateway requires the merge source to be a direct fork of the target, so the request targets the source bucket and names the fork as the merge source. Pass `forkSnapshot` to merge from a specific snapshot of the fork.
- `rebaseFork(forkName, options?)` re-bases a fork onto the latest state of its source bucket.

Both return the resulting `snapshotVersion` (read from the `X-Tigris-Snapshot-Version` response header).

```ts
const { data } = await mergeFork('my-fork', 'source-bucket');
// data.snapshotVersion: string

await rebaseFork('my-fork');
```
