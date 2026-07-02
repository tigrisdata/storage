---
"@tigrisdata/cli": minor
---

Add `buckets rebase` and `buckets merge` commands for working with bucket forks. `rebase` advances a fork onto the latest state of its source bucket; `merge` merges a fork's changes back into its source, auto-resolving the parent (with `--into` to override and `--from-snapshot` to scope the merge).
