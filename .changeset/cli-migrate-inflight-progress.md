---
"@tigrisdata/cli": patch
---

`buckets migrate` now shows a live list of in-flight objects (name, size, time queued) instead of file/byte percentage bars. The gateway performs the migration server-side and exposes no per-object transfer progress, so a percentage computed against total bytes made a large in-flight file look like a stalled run — the per-file queued duration reflects what the CLI actually knows.
