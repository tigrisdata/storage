---
'@tigrisdata/storage': minor
---

Add user-metadata round-trip and fix SigV4 path encoding for keys with sub-delim characters:

- `put` now accepts a `metadata?: Record<string, string>` option and forwards it to S3 as `x-amz-meta-*` headers. `HeadResponse.metadata` (and `PutResponse.metadata`) surface the round-tripped values; key casing follows S3 semantics (lowercased on read).
- Fix: `copy`, `move`, and `updateObject` returned `403 SignatureDoesNotMatch` for keys containing `!`, `'`, `(`, `)`, or `*` (e.g. `holiday (2024).jpg`). `encodeObjectKey` now matches AWS's canonical-URI encoding (`encodeURIComponent` plus the sub-delims that it leaves alone), aligning the client's signed canonical path with the gateway's recomputed canonical.
