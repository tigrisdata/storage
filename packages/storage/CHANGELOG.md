# @tigrisdata/storage

## 3.18.0

### Minor Changes

- [#204](https://github.com/tigrisdata/storage/pull/204) [`55a3b54`](https://github.com/tigrisdata/storage/commit/55a3b54ba9181d528c8a1c56ac52f002be296869) Thanks [@designcode](https://github.com/designcode)! - Add `defaultTier` to `updateBucket` for changing an existing bucket's default storage tier, and `snapshotVersion` to `restoreObject` / `getRestoreInfo` to target a point-in-time bucket snapshot.

## 3.17.2

### Patch Changes

- [#183](https://github.com/tigrisdata/storage/pull/183) [`a06a2bb`](https://github.com/tigrisdata/storage/commit/a06a2bb0234f6e0ddeb0c699d3e559ea94e94cb3) Thanks [@designcode](https://github.com/designcode)! - Stop mutating the global `process.env` when loading configuration. Previously, importing the server entry ran `dotenv.config()` as an import-time side effect, loading the consuming app's entire `.env` (including unrelated keys) into `process.env`.

  Configuration is now resolved on demand, per operation, directly from the environment: the SDK parses `.env` into a private object (never touching `process.env`), keeps only `TIGRIS_`-prefixed keys, and prefers explicitly-set `process.env` values. Importing the SDK no longer has side effects, and apps that manage their own environment are no longer overridden.

## 3.17.1

### Patch Changes

- [#178](https://github.com/tigrisdata/storage/pull/178) [`01926ff`](https://github.com/tigrisdata/storage/commit/01926ffabdb604cff68febeeb134acb236bece8c) Thanks [@designcode](https://github.com/designcode)! - Remove the `forkSnapshot` option from `mergeFork`. `mergeFork(forkName, sourceBucketName, options?)` now always merges from the fork's current state, and the `X-Tigris-Merge-Source-Bucket-Snapshot` header is no longer sent.

## 3.17.0

### Minor Changes

- [#157](https://github.com/tigrisdata/storage/pull/157) [`9d5c591`](https://github.com/tigrisdata/storage/commit/9d5c591059f987b4745c2fb87435c7ccbe465de0) Thanks [@designcode](https://github.com/designcode)! - Add `mergeFork` and `rebaseFork` for managing bucket forks.

  - `mergeFork(forkName, sourceBucketName, options?)` merges a fork's changes back into its parent source bucket. The gateway requires the merge source to be a direct fork of the target, so the request targets the source bucket and names the fork as the merge source. Pass `forkSnapshot` to merge from a specific snapshot of the fork.
  - `rebaseFork(forkName, options?)` re-bases a fork onto the latest state of its source bucket.

  Both return the resulting `snapshotVersion` (read from the `X-Tigris-Snapshot-Version` response header).

  ```ts
  const { data } = await mergeFork("my-fork", "source-bucket");
  // data.snapshotVersion: string

  await rebaseFork("my-fork");
  ```

## 3.16.0

### Minor Changes

- [#168](https://github.com/tigrisdata/storage/pull/168) [`4790e55`](https://github.com/tigrisdata/storage/commit/4790e5566be74397d2738126cc1d7a623d12157e) Thanks [@designcode](https://github.com/designcode)! - Support the `allowObjectAcl` and `enableDirectoryListing` options in `createBucket`.

  - `allowObjectAcl: true` applies the object ACL setting via a follow-up `updateBucket` call once the bucket exists (the S3 `CreateBucket` command can't carry it). If the bucket is created but the ACL update fails — whether it returns an error or throws — the returned error makes the partial state explicit.
  - `enableDirectoryListing: true` enables object listing for the bucket at creation time (relevant for public buckets). It defaults to `false` (listing disabled).

  ```ts
  import { createBucket } from "@tigrisdata/storage";

  await createBucket("my-bucket", { allowObjectAcl: true });
  await createBucket("my-listable-bucket", {
    access: "public",
    enableDirectoryListing: true,
  });
  ```

- [#169](https://github.com/tigrisdata/storage/pull/169) [`f6dade9`](https://github.com/tigrisdata/storage/commit/f6dade9ba5d36a9ce631a57b2d1e6006cb4070b8) Thanks [@designcode](https://github.com/designcode)! - Add `restoreObject` and `getRestoreInfo` for working with archived objects.

  - `restoreObject(path, options?)` restores an archived object (e.g. one in the `GLACIER` tier) back into an actively-readable copy for a number of `days` (defaults to `1`).
  - `getRestoreInfo(path, options?)` reports an object's restore state from its `HEAD` headers as a `RestoreInfo` (`{ status, expiresAt? }`), using the `RestoreStatus` enum (`Archived`, `InProgress`, `Restored`). It resolves to `undefined` when there is no restore information — for a non-archived object or one that does not exist.

  ```ts
  import {
    restoreObject,
    getRestoreInfo,
    RestoreStatus,
  } from "@tigrisdata/storage";

  await restoreObject("archived.bin", { days: 3 });

  const { data } = await getRestoreInfo("archived.bin");
  if (data?.status === RestoreStatus.InProgress) {
    // restore underway
  }
  ```

## 3.15.0

### Minor Changes

- [#161](https://github.com/tigrisdata/storage/pull/161) [`9803a6d`](https://github.com/tigrisdata/storage/commit/9803a6d20c9851573c3ac968c07feb4ef0a4fe9b) Thanks [@designcode](https://github.com/designcode)! - Add `setBucketType`, `enableSnapshot`, and `disableSnapshot` to change a bucket's type (regular vs snapshot) after creation.

  - `setBucketType(bucketName, type, options?)` sets the bucket type to `BucketTypes.Regular` or `BucketTypes.Snapshot`.
  - `enableSnapshot(bucketName, options?)` switches a bucket to a snapshot bucket.
  - `disableSnapshot(bucketName, options?)` switches it back to a regular bucket. It is rejected with an error when the bucket still has dependent forks, since a snapshot parent cannot become regular while forks depend on it.

  Also exports the `BucketTypes` enum and the `SetBucketTypeOptions` / `BucketSnapshotOptions` option types.

  ```ts
  import {
    setBucketType,
    BucketTypes,
    enableSnapshot,
  } from "@tigrisdata/storage";

  await setBucketType("my-bucket", BucketTypes.Snapshot);
  await enableSnapshot("my-bucket");
  ```

## 3.14.0

### Minor Changes

- [#159](https://github.com/tigrisdata/storage/pull/159) [`139a0cf`](https://github.com/tigrisdata/storage/commit/139a0cf2c9babbee2e2892c9b00b21094abd2dfb) Thanks [@designcode](https://github.com/designcode)! - Fix bucket-listing pagination and enrich `listForks` results.

  - **Pagination fix**: `fetchBucketListing` now sends the gateway's expected `continuation-token` and `max-buckets` query params (previously `ContinuationToken`/`MaxBuckets`) and reads the `ContinuationToken` field from the response (previously the non-existent `NextContinuationToken`/`IsTruncated` pair). This repairs pagination for `listBuckets`, `listForks`, and `getStats`, which previously could drop the continuation token or ignore the requested page size.
  - **`listForks` now resolves forks through the shared listing endpoint** and returns full `Bucket` fields plus fork info (`forkInfo.parents` with the parent bucket, fork-creation time, and source snapshot).
  - **Restored backward compatibility**: `ForkedBucket` is exported again, and each returned fork carries the `forkCreatedAt`, `snapshot`, and `snapshotCreatedAt` fields that were dropped in the previous `listForks` rework. These are deprecated in favor of `forkInfo.parents[0]`.

  While the gateway update rolls out, `listForks` transparently falls back to a client-side implementation (listing all buckets and filtering by parent). In that fallback the deprecated fork fields are still populated, but `forkInfo` and server-side pagination of forks are unavailable until the update reaches production.

## 3.13.0

### Minor Changes

- [#155](https://github.com/tigrisdata/storage/pull/155) [`ac3e0b1`](https://github.com/tigrisdata/storage/commit/ac3e0b11517226012924dc68cb9a06150f5ad7dc) Thanks [@designcode](https://github.com/designcode)! - Rework `listForks` to resolve forks server-side and add pagination.

  `listForks` now lists a source bucket's forks with a single fork-scoped `ListBuckets` request (via the `X-Tigris-Fork` header) instead of paging the entire bucket listing and filtering by parent client-side. This avoids scanning every bucket in the account.

  - Forks are now returned as `BucketFork` (`{ name, creationDate }`), replacing `ForkedBucket`.
  - `ListForksOptions` accepts `limit` and `paginationToken`, and `ListForksResponse` returns a `paginationToken`, so callers can page through forks.

  ```ts
  const { data } = await listForks("source-bucket", { limit: 50 });
  // data.forks: { name: string; creationDate: Date }[]
  // data.paginationToken?: string — pass back via options to fetch the next page
  ```

### Patch Changes

- [#140](https://github.com/tigrisdata/storage/pull/140) [`493223d`](https://github.com/tigrisdata/storage/commit/493223d0c6a3dd2a20ed4e522a44834cb9e56abc) Thanks [@designcode](https://github.com/designcode)! - Implement `snapshotVersion` support on `getPresignedUrl`. When set, the returned URL is pinned to the version of the object that was current at the time of the snapshot.

  Implemented as a client-side workaround since the gateway's `/?func=presign` endpoint doesn't honor `versionId`: lists the key's versions, finds the latest `versionId <= snapshotVersion` (compared as `BigInt` ns-epoch timestamps), then signs a `GetObject` URL through the AWS SDK presigner with that explicit `VersionId`. The gateway is S3-compatible and honors `versionId` baked into the signed URL.

  Only valid with `operation: 'get'`. Returns an error when the object did not exist at the snapshot time, or when `snapshotVersion` is combined with `operation: 'put'`. Paginates `listVersions` to handle keys with many versions, and filters by exact key match so prefix-colliding siblings (e.g. `foo.txt` vs `foo.txt.bak`) don't pollute the candidate set.

## 3.12.0

### Minor Changes

- [#141](https://github.com/tigrisdata/storage/pull/141) [`04a9b99`](https://github.com/tigrisdata/storage/commit/04a9b99e1a5b9960e23f717f1a4195a69ae54ee2) Thanks [@designcode](https://github.com/designcode)! - Add bucket soft-delete support.

  - `updateBucket(name, options)` accepts `softDelete: { enabled: true; retentionDays: number } | { enabled: false }` to configure recoverable bucket deletion.
  - `getBucketInfo(name)` returns `settings.softDelete` with the same discriminated shape.
  - `listBuckets({ deleted: true })` lists soft-deleted buckets, and each `Bucket` now carries `softDeleteInfo` when soft delete is enabled.
  - `restoreBucket(name, options)` recovers a soft-deleted bucket within its retention window.

  The `enableDeleteProtection` option on `updateBucket` and the `deleteProtection` field on `getBucketInfo` are deprecated in favor of `softDelete`.

## 3.11.0

### Minor Changes

- [#132](https://github.com/tigrisdata/storage/pull/132) [`b532b1d`](https://github.com/tigrisdata/storage/commit/b532b1d25cd40e543d8df800c43700a85f5faf7e) Thanks [@designcode](https://github.com/designcode)! - Extend `get` with byte-range reads and an opt-in metadata wrapper.

  **Byte ranges** via `range?: { start: number; end?: number }` — inclusive, 0-based, matching HTTP `Range: bytes=start-end`. Omit `end` to read from `start` to the end of the object. Invalid ranges are rejected client-side; a range outside the object returns an error from the gateway (HTTP 416).

  **Metadata wrapper** via `includeMetadata?: boolean` — when `true`, `get` returns `{ body, metadata }` instead of the bare body. `metadata` carries the object's `etag`, `contentType`, `contentDisposition`, `modified`, `size` (body bytes), `totalSize` (full object size — derived from `Content-Range` on range reads), `userMetadata` (the `x-amz-meta-*` map), and `contentRange` (when `range` is used). All read from the same S3 response — no extra round-trip versus calling `head` separately. Existing callers without `includeMetadata` are unaffected (the overload narrows on the literal `true`).

  ```ts
  // Bare body (existing behavior)
  const { data } = await get("file.txt", "string");
  // data: string

  // Body + metadata
  const { data } = await get("file.txt", "string", { includeMetadata: true });
  // data: { body: string, metadata: { etag, modified, size, userMetadata, ... } }

  // Range + metadata together
  const { data } = await get("large.bin", "stream", {
    range: { start: 0, end: 1023 },
    includeMetadata: true,
  });
  // data.metadata.contentRange === "bytes 0-1023/<total>"
  ```

## 3.10.0

### Minor Changes

- [#130](https://github.com/tigrisdata/storage/pull/130) [`3757d70`](https://github.com/tigrisdata/storage/commit/3757d70166c62ace2fb3e9562ae08d289bdfe952) Thanks [@designcode](https://github.com/designcode)! - Add `BucketInfoResponse.locations: BucketLocations` to `getBucketInfo` — a structured discriminated-union view of the bucket's region configuration that aligns with the `BucketLocations` type used by `createBucket` and `updateBucket`. Distinguishes `global` / `multi` / `single` / `dual` configurations.

  The legacy `BucketInfoResponse.regions: string[]` field is now deprecated; use `locations` instead. `regions` will be removed in the next major version.

  Note on single-vs-dual readback: the wire format stores a single region identically for `{ type: 'single' }` and `{ type: 'dual', values: <one> }`. Parsing prefers `single` for one-value cases — the underlying region selection is unchanged, only the type tag differs.

## 3.9.1

### Patch Changes

- [#128](https://github.com/tigrisdata/storage/pull/128) [`d87fadc`](https://github.com/tigrisdata/storage/commit/d87fadc621c6e8c73a1700e2f9bd15328a14b67d) Thanks [@designcode](https://github.com/designcode)! - add regions in getBucketInfo response

## 3.9.0

### Minor Changes

- [#126](https://github.com/tigrisdata/storage/pull/126) [`df9d4f2`](https://github.com/tigrisdata/storage/commit/df9d4f2ee4045a0ab7f9a637fcd92e756248e3e2) Thanks [@designcode](https://github.com/designcode)! - Add `getSignedUploadUrl(key, options)` (server) and `uploadToSignedUrl(name, data, signed, options)` (client) for direct browser-to-Tigris uploads.

  Returns a discriminated upload contract:

  - **PUT** (default): simple presigned URL. Submit the body as the request payload with any required headers. Supports `contentType`, `metadata`, and `access` via signed headers.
  - **POST** (S3 POST policy): triggered automatically when `maxSize`, `minSize`, or `successActionRedirect` is set — knobs that PUT can't express. Submit a `multipart/form-data` body with the returned `fields` followed by the `file` input.

  The client helper `uploadToSignedUrl` consumes either contract and exposes the same `UploadResponse` shape as the existing `upload()` helper.

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
