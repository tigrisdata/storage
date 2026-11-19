---
"@tigrisdata/storage": minor
---

Make `allowOverwrite: false` atomic. `put`, client `upload` and `completeMultipartUpload` now send `If-None-Match: *`, so a concurrent writer can no longer be overwritten between the existence check and the upload, at any size. A conflict returns the existing `File already exists` error. Also fixes client `upload` ignoring `allowOverwrite`, client multipart uploads reporting success when the server failed to complete them, and `put` leaving parts behind when a large upload failed without `multipart` set.
