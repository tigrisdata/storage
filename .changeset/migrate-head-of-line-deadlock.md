---
"@tigrisdata/cli": patch
---

Fix a deadlock in `tigris buckets migrate` that stalled large migrations, and
overhaul how migrations are paced and displayed.

- **Deadlock fix:** the drain step only polled the oldest in-flight objects, so
  a slow object at the head hid the completed objects behind it — their bytes
  were never freed, the in-flight budget stayed pinned at its cap, and the
  migration wedged (progress frozen with in-flight stuck at ~10 GB). It now
  polls a rotating window across the whole in-flight set, so completions are
  observed regardless of position.
- **Smallest-first:** objects migrate smallest-first, so progress climbs quickly
  and large files finish at the end instead of stalling mid-run.
- **In-flight caps:** in-flight work is bounded by both object count and total
  bytes, and the byte budget is enforced across the pending schedule batch, so a
  large file can't be scheduled alongside a full batch and blow the budget.
- **Poll backoff:** the `isMigrated` poll backs off (5s up to 30s) after sweeps
  where nothing completed, and resets on the next completion, so an idle
  migration stops hammering the gateway with status checks.
- **Multi-line, live progress:** progress renders as a sticky multi-line block —
  bucket and elapsed clock, file and byte percentages, and the file currently
  being pulled (name, size, and how long it has been going) plus the in-flight
  count. It redraws in place instead of duplicating lines on window resize, and
  truncates each line to the terminal width so nothing wraps. There is no
  throughput figure: confirmations are lumpy binary flips (the gateway does the
  transfer), not a byte stream, so an "obj/s · MB/s" rate would misrepresent
  progress.
- **Responsive cancel:** Ctrl-C stops scheduling and polling and prints a
  summary of what was confirmed; objects already scheduled remain queued for
  migration server-side, so re-running resumes from there. It is felt
  immediately (the poll wait is abortable rather than blocking until it
  elapses), and a second Ctrl-C forces an immediate exit.
