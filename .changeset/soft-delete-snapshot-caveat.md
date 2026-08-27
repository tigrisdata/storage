---
'@tigrisdata/storage': patch
'@tigrisdata/cli': patch
---

Correct the snapshot-bucket caveat on soft delete.

The docs said not to rely on soft delete at all on a snapshot bucket. What actually happens is narrower: a **plain** delete there records a delete marker rather than soft-deleting, so nothing lands in the soft-delete view — but deleting one specific version does soft-delete that version, and it shows up in `list({ deleted: true })` like any other.
