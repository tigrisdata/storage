---
"@tigrisdata/cli": patch
---

Requests the CLI makes through the Tigris HTTP client (bucket listing and stats, copy/move, bucket settings) are retried on transient failures — 3 attempts with backoff and full jitter on 408/429/5xx and network errors — instead of failing on the first blip. Requests that go through the AWS SDK's S3 client keep its own retry policy, as before.
