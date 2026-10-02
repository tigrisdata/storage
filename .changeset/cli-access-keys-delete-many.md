---
"@tigrisdata/cli": minor
---

`tigris access-keys delete` takes a comma-separated list of IDs, like `buckets delete`: one confirmation for the batch, each key deleted in turn, failures reported per key without stopping the rest, and a non-zero exit if any failed.
