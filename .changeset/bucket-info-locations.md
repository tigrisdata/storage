---
'@tigrisdata/storage': minor
---

Add `BucketInfoResponse.locations: BucketLocations` to `getBucketInfo` — a structured discriminated-union view of the bucket's region configuration that aligns with the `BucketLocations` type used by `createBucket` and `updateBucket`. Distinguishes `global` / `multi` / `single` / `dual` configurations.

The legacy `BucketInfoResponse.regions: string[]` field is now deprecated; use `locations` instead. `regions` will be removed in the next major version.

Note on single-vs-dual readback: the wire format stores a single region identically for `{ type: 'single' }` and `{ type: 'dual', values: <one> }`. Parsing prefers `single` for one-value cases — the underlying region selection is unchanged, only the type tag differs.
