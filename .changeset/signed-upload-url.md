---
'@tigrisdata/storage': minor
---

Add `getSignedUploadUrl(key, options)` (server) and `uploadToSignedUrl(name, data, signed, options)` (client) for direct browser-to-Tigris uploads.

Returns a discriminated upload contract:

- **PUT** (default): simple presigned URL. Submit the body as the request payload with any required headers. Supports `contentType`, `metadata`, and `access` via signed headers.
- **POST** (S3 POST policy): triggered automatically when `maxSize`, `minSize`, or `successActionRedirect` is set — knobs that PUT can't express. Submit a `multipart/form-data` body with the returned `fields` followed by the `file` input.

The client helper `uploadToSignedUrl` consumes either contract and exposes the same `UploadResponse` shape as the existing `upload()` helper.
