---
"@tigrisdata/cli": patch
---

Fix a deadlock in `tigris buckets migrate` that stalled large migrations. The
drain step only polled the oldest in-flight objects, so a slow object at the
head hid the completed objects behind it — their bytes were never freed, the
in-flight budget stayed pinned at its cap, and the migration wedged (progress
frozen with in-flight stuck at ~10 GB). It now polls a rotating window across
the whole in-flight set, so completions are observed regardless of position.
