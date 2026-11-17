---
"@tigrisdata/storage": minor
---

`createBucket` accepts a `softDelete` option (`{ enabled: true, retentionDays }`), so soft delete can be turned on when the bucket is created instead of with a separate `updateBucket` call.
