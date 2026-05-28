---
'@tigrisdata/storage': minor
---

Add byte-range support to `get` via a new `range?: { start: number; end?: number }` option. Both bounds are inclusive and 0-based, matching HTTP `Range: bytes=start-end` semantics. Omit `end` to read from `start` to the end of the object. The returned body (string, File, or stream) is the partial content only.

```ts
const { data } = await get('large.bin', 'stream', {
  range: { start: 0, end: 1023 }, // first 1 KiB
});
```

Invalid ranges (e.g. `end < start`, negative `start`) are rejected client-side before the request is sent. A range that falls entirely outside the object returns an error from the gateway (HTTP 416).
