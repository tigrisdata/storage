---
"@tigrisdata/storage": minor
---

`listBuckets` takes two new filters: `forksOnly` (only buckets that are forks of another bucket) and `owner` (only buckets owned by the given username, an email address). They are sent to the gateway as the `OnlyForked` and `OwnedBy` query parameters and compose with `deleted` and pagination.
