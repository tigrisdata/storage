# @tigrisdata/storage

## 3.8.1

### Patch Changes

- [#120](https://github.com/tigrisdata/storage/pull/120) [`91e3391`](https://github.com/tigrisdata/storage/commit/91e33919e9537b07fbba2f94fc921d2019f24a51) Thanks [@designcode](https://github.com/designcode)! - Expose object ETag on `PutResponse`, `HeadResponse`, and `ListItem` (`etag: string`). Populated from the underlying S3 PUT, HEAD, and ListObjectsV2 responses.

## 3.8.0

### Minor Changes

- [#118](https://github.com/tigrisdata/storage/pull/118) [`c0cc766`](https://github.com/tigrisdata/storage/commit/c0cc7660bde53b2de4e31dec3067572a3bade731) Thanks [@designcode](https://github.com/designcode)! - Add user-metadata round-trip and fix SigV4 path encoding for keys with sub-delim characters:

  - `put` now accepts a `metadata?: Record<string, string>` option and forwards it to S3 as `x-amz-meta-*` headers. `HeadResponse.metadata` (and `PutResponse.metadata`) surface the round-tripped values; key casing follows S3 semantics (lowercased on read).
  - Fix: `copy`, `move`, and `updateObject` returned `403 SignatureDoesNotMatch` for keys containing `!`, `'`, `(`, `)`, or `*` (e.g. `holiday (2024).jpg`). `encodeObjectKey` now matches AWS's canonical-URI encoding (`encodeURIComponent` plus the sub-delims that it leaves alone), aligning the client's signed canonical path with the gateway's recomputed canonical.

## 3.7.0

### Minor Changes

- [#116](https://github.com/tigrisdata/storage/pull/116) [`76983d1`](https://github.com/tigrisdata/storage/commit/76983d15a040257c7932cefc5ff10d1fb1df3ac6) Thanks [@designcode](https://github.com/designcode)! - Add fork listing and snapshot deletion, and expand bucket listing fields:

  - New `listForks(sourceBucketName?)` returns every bucket that forks from the given source as `ForkedBucket[]` (name, creation date, fork timestamp, source snapshot, snapshot creation date).
  - New `deleteBucketSnapshot(sourceBucketName, snapshotVersion)` deletes a specific snapshot version of a bucket.
  - `listBuckets` and `getStats` now return additional bucket metadata: `regions`, `type` (`Regular` | `Snapshot`), and `visibility` (`public` | `private`).

## 3.6.0

### Minor Changes

- [#103](https://github.com/tigrisdata/storage/pull/103) [`fd56aa7`](https://github.com/tigrisdata/storage/commit/fd56aa794eb9a68bdee348e8b4e925f844f42438) Thanks [@designcode](https://github.com/designcode)! - Add support for S3 object-version operations on snapshot-enabled buckets:

  - New `listVersions({ prefix, delimiter, limit, keyMarker, versionIdMarker })` returns the object versions and delete markers for a bucket prefix, plus `nextKeyMarker` / `nextVersionIdMarker` for pagination.
  - `head`, `get`, and `remove` now accept a `versionId` option. On `head` / `get` it selects the specified version; on `remove` it permanently deletes that version (without one, `remove` creates a delete marker on a versioned bucket, matching S3 semantics).

  Versioning is enabled implicitly by snapshots — pass `enableSnapshot: true` to `createBucket`.

## 3.5.2

### Patch Changes

- [#101](https://github.com/tigrisdata/storage/pull/101) [`6306356`](https://github.com/tigrisdata/storage/commit/6306356b6203c5d02cf90bb2ce566bcfdf9fa110) Thanks [@designcode](https://github.com/designcode)! - Fix `403 SignatureDoesNotMatch` from `copy`, `move`, and `updateObject` when the object key contains `/` or any other character that requires percent-encoding (space, `?`, `=`, etc.) and the request is signed with access-key SigV4.

  Two related fixes:

  - Custom HTTP client now constructs `SignatureV4` with `uriEscapePath: false`, matching S3's single-encoding canonical-path scheme. The default `true` (AWS-standard double-encoding) caused the signer to re-escape any percent sequence in the path during canonicalization, while Tigris gateway uses S3 single-encoding — producing the mismatch for every key with a special char.
  - Object keys in the request path and `X-Amz-Copy-Source` header are URL-encoded per-segment via the new `encodeObjectKey` helper, preserving `/` as a separator so the wire URL stays valid.

  OAuth/session-token callers were unaffected because that auth path skips SigV4 signing entirely.

## 3.5.1

### Patch Changes

- [#99](https://github.com/tigrisdata/storage/pull/99) [`aa03ea5`](https://github.com/tigrisdata/storage/commit/aa03ea53d5096dbfe67a969262b55ca58aa0b33e) Thanks [@designcode](https://github.com/designcode)! - `move` no longer accepts `srcBucket` / `destBucket` options — cross-bucket moves are not supported by the server. Use `copy` followed by `remove` to move objects between buckets.

## 3.5.0

### Minor Changes

- [#97](https://github.com/tigrisdata/storage/pull/97) [`024f9e0`](https://github.com/tigrisdata/storage/commit/024f9e029d7a478f85f4e115610e1da9454431f2) Thanks [@designcode](https://github.com/designcode)! - Add `copy(src, dest, options?)` and `move(src, dest, options?)` for copying and moving objects within or across buckets. Add `setObjectAccess(path, { access })` for changing object ACLs. Deprecate `updateObject`; use `setObjectAccess` for ACL changes and `move` for renames.
