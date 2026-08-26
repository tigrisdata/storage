---
"@tigrisdata/storage": minor
"@tigrisdata/iam": minor
---

Add opt-in request retry and injectable error hooks to the HTTP client.

`retry` can be set on any `config` option, or per request. It is opt-in —
omitted or `false` performs a single attempt, matching existing behavior. When
enabled it defaults to 3 attempts with exponential backoff and full jitter,
honors `Retry-After`, and retries only `408`, `429`, and `5xx`; `400` and `403`
are deliberately excluded because they are deterministic for this client.
`shouldRetry` overrides the decision entirely.

Transport failures — where the request never produced a response — are treated
separately from status codes, because the outcome is unknown and a write may
already have landed. They are retried only when the request method is safe to
re-send (`GET` and `HEAD`); enabling `retry` on a `POST`, `PUT`, `PATCH`, or
`DELETE` retries retryable statuses but not transport failures. Set
`retryNetworkErrors: true` to opt a known-safe operation back in. Status-code
retries are unaffected by the method.

```ts
await updateBucket('my-bucket', {
  access: 'public',
  config: { retry: { attempts: 5 } },
});
```

`setTigrisHttpHooks({ onError, onRetry })` registers process-wide observability
callbacks so telemetry (Sentry, logging, metrics) can be wired in without this
SDK taking on the dependency. Hooks are observational: a throwing or rejecting
hook can never fail a request, and none are awaited. A single registration
covers every Tigris SDK package in the process, so registering through
`@tigrisdata/storage` also reports `@tigrisdata/iam` failures.

The hook context reports `origin` and `path` separately, so a consumer can use
the host-independent `path` as an identifier or recompose the absolute URL as
`${origin}${path}` to match what another HTTP client would report for the same
endpoint. The `shouldRetry` predicate receives the same pair.

Both `retry` and the hooks cover requests made through the Tigris HTTP client —
the bucket, fork, and IAM operations. Object data-plane calls (`put`, `get`,
`list`, multipart) go through the AWS SDK's S3 client, which applies its own
retry policy and is not covered by the hooks.

Also fixes a latent crash where a 2xx response carrying a JSON content-type but
an empty body — as `POST ?restore` returns — threw a parse error out of
`request()` instead of resolving.
