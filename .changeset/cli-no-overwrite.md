---
"@tigrisdata/cli": minor
---

Add `--no-overwrite` to `tigris objects put` and `tigris cp` (local to remote). A single upload fails if the key exists; recursive and wildcard copies skip existing keys and report how many were skipped.
