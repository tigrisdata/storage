---
"@tigrisdata/cli": patch
---

Fix a deadlock in `tigris buckets migrate` that stalled large migrations, and
improve how large-file migrations look and behave.

- **Deadlock fix:** the drain step only polled the oldest in-flight objects, so
  a slow object at the head hid the completed objects behind it — their bytes
  were never freed, the in-flight budget stayed pinned at its cap, and the
  migration wedged (progress frozen with in-flight stuck at ~10 GB). It now
  polls a rotating window across the whole in-flight set, so completions are
  observed regardless of position.
- **Smallest-first:** objects now migrate smallest-first, so progress climbs
  quickly and large files finish at the end instead of stalling mid-run.
- **Object-count cap:** in-flight is now bounded by object count as well as
  bytes, keeping the poll set manageable on runs with millions of small files.
- **Clearer progress:** the progress line now shows throughput (objects/s and
  bytes/s), the in-flight object count, and — when a transfer has been running a
  while — the oldest in-flight object (name, size, and how long it has been
  pulling), so a slow large file is visibly attributed instead of looking stuck.
