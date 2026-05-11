---
'@tigrisdata/storage': patch
---

Fix `403 SignatureDoesNotMatch` from `copy`, `move`, and `updateObject` when the object key contains `/` and the request is signed with access-key SigV4.

Object keys in the request path and `X-Amz-Copy-Source` header are now URL-encoded per-segment via the new `encodeObjectKey` helper, preserving `/` as a separator. Previously, plain `encodeURIComponent(key)` turned `/` into `%2F`, which the signer then double-escaped to `%252F` during canonical-request construction — diverging from the gateway's canonical path and producing `SignatureDoesNotMatch`. OAuth/session-token callers were unaffected because that auth path skips SigV4 signing entirely.
