---
'@tigrisdata/storage': minor
---

Add `Cache-Control` support to uploads.

`put()` accepts a `cacheControl` option, stored with the object and returned by
Tigris on every read. Public buckets otherwise fall back to
`public, max-age=3600` for recognised static asset types.

```ts
await put('assets/app.abc123.js', body, {
  access: 'public',
  cacheControl: 'public, max-age=31536000, immutable',
});
```

`getSignedUploadUrl()` accepts the same option, so browser uploads can be locked
to a cache policy — on the PUT contract it comes back as a required
`Cache-Control` header, and on the POST contract it is baked into the form
policy.

`head()` now returns the stored value as `cacheControl`, and `put()` echoes it
back on `PutResponse`.
