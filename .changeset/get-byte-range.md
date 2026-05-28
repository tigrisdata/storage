---
'@tigrisdata/storage': minor
---

Extend `get` with byte-range reads and an opt-in metadata wrapper.

**Byte ranges** via `range?: { start: number; end?: number }` — inclusive, 0-based, matching HTTP `Range: bytes=start-end`. Omit `end` to read from `start` to the end of the object. Invalid ranges are rejected client-side; a range outside the object returns an error from the gateway (HTTP 416).

**Metadata wrapper** via `includeMetadata?: boolean` — when `true`, `get` returns `{ body, metadata }` instead of the bare body. `metadata` carries the object's `etag`, `contentType`, `contentDisposition`, `modified`, `size`, `userMetadata` (the `x-amz-meta-*` map), and `contentRange` (when `range` is used). All read from the same S3 response — no extra round-trip versus calling `head` separately. Existing callers without `includeMetadata` are unaffected (the overload narrows on the literal `true`).

```ts
// Bare body (existing behavior)
const { data } = await get('file.txt', 'string');
// data: string

// Body + metadata
const { data } = await get('file.txt', 'string', { includeMetadata: true });
// data: { body: string, metadata: { etag, modified, size, userMetadata, ... } }

// Range + metadata together
const { data } = await get('large.bin', 'stream', {
  range: { start: 0, end: 1023 },
  includeMetadata: true,
});
// data.metadata.contentRange === "bytes 0-1023/<total>"
```
