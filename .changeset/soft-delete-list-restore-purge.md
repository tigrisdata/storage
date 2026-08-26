---
'@tigrisdata/storage': minor
---

Add soft-delete object recovery: list deleted objects, restore one, or purge it for good.

- `list({ deleted: true })` and `listVersions({ deleted: true })` read the bucket's soft-delete view instead of its live objects.
- `restoreDeletedObject(path, versionId)` brings a deleted object back.
- `purgeDeletedObject(path, versionId)` permanently destroys a deleted version before its retention period expires.
