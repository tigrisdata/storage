---
'@tigrisdata/iam': patch
---

Use the Web Crypto global instead of `node:crypto` for request UUIDs, so the
package can be bundled for a browser. `crypto.randomUUID()` is the same source
already used by `addPolicy` and `editPolicy`.
