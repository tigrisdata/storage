---
"@tigrisdata/iam": minor
"@tigrisdata/storage": patch
---

Add `createTemporaryCredentials(name, options)` to `@tigrisdata/iam`. It issues temporary credentials (STS `GetFederationToken`) limited to one bucket, with `access: 'read' | 'write' | 'readwrite'`, exact `actions`, or a full `policy`, and an optional `durationSeconds` (900 to 129600). The result plugs straight into `@tigrisdata/storage`. It needs an access key, as Tigris refuses OAuth sessions here. Set `stsEndpoint` or `TIGRIS_STS_ENDPOINT` to use an STS endpoint other than `https://sts.storage.dev`.

`@tigrisdata/iam` now depends on `@smithy/signature-v4`, `@aws-crypto/sha256-js` and `@aws-sdk/xml-builder` instead of bundling its own copies, which shrinks its build from about 84 KB to 31 KB. Apps that also use `@tigrisdata/storage` share one copy of each.

Errors with an XML body, such as S3 and STS errors, now report the gateway's message instead of just the HTTP status text.
