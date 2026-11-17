---
"@tigrisdata/storage": minor
"@tigrisdata/cli": minor
---

Add support for [global user metadata](https://www.tigrisdata.com/docs/objects/global-user-metadata/).

- `@tigrisdata/storage`: `createBucket` accepts `enableGlobalUserMetadata` to replicate objects' user metadata to every region, and `list` accepts `includeMetadata` to return each object's user metadata as `metadata` on every item.
- `@tigrisdata/cli`: `tigris buckets create` and `tigris mk` accept `--global-user-metadata`.
