---
'@tigrisdata/cli': minor
---

Add `tigris snapshots delete` to remove snapshots from a bucket

Snapshots could be taken and listed, but never deleted from the CLI — the only
way to drop one was to call the SDK's `deleteBucketSnapshot` directly. The new
command closes that gap:

```sh
tigris snapshots delete my-bucket 1765889000501544464 --yes
tigris snapshots delete my-bucket 1765889000501544464,1765889000501544465 --yes
```

- Takes the bucket name and one or more snapshot versions, comma-separated.
  Find versions with `tigris snapshots list`.
- Prompts for confirmation before deleting; `--yes` (or `--force`) skips the
  prompt. Like the other destructive commands, it refuses to run without
  `--yes` when stdin is not a TTY.
- Deletes each version in turn and reports per-version success or failure, so
  one bad version in a list does not hide the outcome of the others. Exits
  non-zero if any deletion failed.
- `--format json` emits `{ action, bucket, versions, errors }`, matching the
  shape `buckets delete` already returns.

Deletion is permanent. Forks already created from a snapshot are unaffected.
