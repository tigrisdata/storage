---
'@tigrisdata/cli': minor
'@tigrisdata/storage': patch
---

Surface soft-delete object recovery in the CLI.

- `tigris objects list <bucket> --deleted` lists soft-deleted objects.
- `tigris objects list-versions <bucket> --deleted` lists their recoverable versions.
- `tigris objects restore-deleted <bucket> <key> --version-id <id>` brings one back.
- `tigris objects purge <bucket> <key> --version-id <id>` destroys one for good.

Also documents that soft delete should not be relied on for snapshot buckets — those keep deleted objects as versions, recoverable with `tigris objects list-versions`.
