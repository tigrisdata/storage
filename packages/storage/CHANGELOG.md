# @tigrisdata/storage

## 3.5.1

### Patch Changes

- [#99](https://github.com/tigrisdata/storage/pull/99) [`aa03ea5`](https://github.com/tigrisdata/storage/commit/aa03ea53d5096dbfe67a969262b55ca58aa0b33e) Thanks [@designcode](https://github.com/designcode)! - `move` no longer accepts `srcBucket` / `destBucket` options — cross-bucket moves are not supported by the server. Use `copy` followed by `remove` to move objects between buckets.

## 3.5.0

### Minor Changes

- [#97](https://github.com/tigrisdata/storage/pull/97) [`024f9e0`](https://github.com/tigrisdata/storage/commit/024f9e029d7a478f85f4e115610e1da9454431f2) Thanks [@designcode](https://github.com/designcode)! - Add `copy(src, dest, options?)` and `move(src, dest, options?)` for copying and moving objects within or across buckets. Add `setObjectAccess(path, { access })` for changing object ACLs. Deprecate `updateObject`; use `setObjectAccess` for ACL changes and `move` for renames.
