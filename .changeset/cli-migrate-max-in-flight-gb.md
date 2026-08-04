---
'@tigrisdata/cli': minor
'tigris': minor
---

`tigris buckets migrate` keeps more data in flight by default, and the budget is
now tunable per run.

- The in-flight byte budget — the total size of migrations scheduled
  server-side but not yet confirmed — rises from 10 GB to 50 GB. A run made up
  of multi-gigabyte objects can now keep several of them in flight at once
  instead of serializing files that individually exceeded the old budget.
- New `--max-in-flight-gb` overrides that budget, accepting 1 to 100 (default
  50). Out-of-range and non-numeric values are rejected up front — before
  discovery lists the bucket — rather than silently clamped, so the flag always
  means what it says. The separate 1,000-object in-flight cap is unchanged.
