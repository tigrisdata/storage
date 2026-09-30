---
"@tigrisdata/cli": minor
---

`tigris buckets list` takes `--forks-only` (only buckets that are forks of another bucket) and `--owner <username>` (only buckets owned by that user). Both compose with `--deleted` and pagination; like `--deleted`, they do not apply to the separate `--forks-of` listing.
