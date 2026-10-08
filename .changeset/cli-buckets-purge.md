---
"@tigrisdata/cli": minor
---

`tigris buckets purge` permanently destroys one or more soft-deleted buckets (comma-separated), after a confirmation that names them; `--yes` skips it. Each bucket is purged in turn, failures are reported per bucket without stopping the rest, and the exit code is non-zero if any failed. Purged buckets can no longer be restored.
