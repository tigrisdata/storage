---
"@tigrisdata/storage": minor
"@tigrisdata/cli": minor
---

Add opt-in atomic create-only uploads with SDK `ifAbsent` and CLI `objects put --if-absent`. The bounded path sends `If-None-Match: *` for known-size bodies up to 5 MiB and rejects streams, multipart uploads and custom part sizes. Existing defaults and `allowOverwrite` behavior remain unchanged.
