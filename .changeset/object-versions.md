---
'@tigrisdata/storage': minor
---

Add support for S3 object-version operations on snapshot-enabled buckets:

- New `listVersions({ prefix, delimiter, limit, keyMarker, versionIdMarker })` returns the object versions and delete markers for a bucket prefix, plus `nextKeyMarker` / `nextVersionIdMarker` for pagination.
- `head`, `get`, and `remove` now accept a `versionId` option. On `head` / `get` it selects the specified version; on `remove` it permanently deletes that version (without one, `remove` creates a delete marker on a versioned bucket, matching S3 semantics).

Versioning is enabled implicitly by snapshots — pass `enableSnapshot: true` to `createBucket`.
