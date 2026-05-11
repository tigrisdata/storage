---
'@tigrisdata/storage': patch
---

Fix `403 SignatureDoesNotMatch` from `copy`, `move`, and `updateObject` when the object key contains `/` or any other character that requires percent-encoding (space, `?`, `=`, etc.) and the request is signed with access-key SigV4.

Two related fixes:

- Custom HTTP client now constructs `SignatureV4` with `uriEscapePath: false`, matching S3's single-encoding canonical-path scheme. The default `true` (AWS-standard double-encoding) caused the signer to re-escape any percent sequence in the path during canonicalization, while Tigris gateway uses S3 single-encoding — producing the mismatch for every key with a special char.
- Object keys in the request path and `X-Amz-Copy-Source` header are URL-encoded per-segment via the new `encodeObjectKey` helper, preserving `/` as a separator so the wire URL stays valid.

OAuth/session-token callers were unaffected because that auth path skips SigV4 signing entirely.
