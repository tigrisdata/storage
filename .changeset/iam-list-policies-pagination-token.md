---
"@tigrisdata/iam": patch
---

Fix `listPolicies` never returning a `paginationToken`. The `IsTruncated` and `Marker` fields are nested inside `ListPoliciesResult` in the API response, but were being read from the top level, so the next-page token was always `undefined`.
