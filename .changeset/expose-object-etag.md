---
'@tigrisdata/storage': patch
---

Expose object ETag on `PutResponse`, `HeadResponse`, and `ListItem` (`etag: string`). Populated from the underlying S3 PUT, HEAD, and ListObjectsV2 responses.
