---
'@tigrisdata/storage': patch
---

Implement `snapshotVersion` support on `getPresignedUrl`. When set, the returned URL is pinned to the version of the object that was current at the time of the snapshot.

Implemented as a client-side workaround since the gateway's `/?func=presign` endpoint doesn't honor `versionId`: lists the key's versions, finds the latest `versionId <= snapshotVersion` (compared as `BigInt` ns-epoch timestamps), then signs a `GetObject` URL through the AWS SDK presigner with that explicit `VersionId`. The gateway is S3-compatible and honors `versionId` baked into the signed URL.

Only valid with `operation: 'get'`. Returns an error when the object did not exist at the snapshot time, or when `snapshotVersion` is combined with `operation: 'put'`. Paginates `listVersions` to handle keys with many versions, and filters by exact key match so prefix-colliding siblings (e.g. `foo.txt` vs `foo.txt.bak`) don't pollute the candidate set.
