---
'@tigrisdata/cli': patch
---

Fix commands exiting 0 when a required argument was missing.

A command declaring an argument as required printed the reason (e.g. `--access is required`) and then exited 0, so a rejected invocation was indistinguishable from a successful one and scripts carried on as if the command had worked. It now exits 1. Affects `tigris objects set --access` and `tigris iam users update-role --role`.

The error also now prints the argument's description, since a required flag was previously indistinguishable from an optional one. Required flags are marked as such in the generated command reference for the same reason.
