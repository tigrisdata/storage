---
"@tigrisdata/storage": minor
---

`purgeBucket(name)` permanently destroys a soft-deleted bucket before its retention period expires — the counterpart of `restoreBucket`. The bucket must already be soft-deleted (the gateway rejects a live one) and can no longer be restored afterwards; list the candidates with `listBuckets({ deleted: true })`.
