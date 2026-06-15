---
'@tigrisdata/storage': minor
---

Rework `listForks` to resolve forks server-side and add pagination.

`listForks` now lists a source bucket's forks with a single fork-scoped `ListBuckets` request (via the `X-Tigris-Fork` header) instead of paging the entire bucket listing and filtering by parent client-side. This avoids scanning every bucket in the account.

- Forks are now returned as `BucketFork` (`{ name, creationDate }`), replacing `ForkedBucket`.
- `ListForksOptions` accepts `limit` and `paginationToken`, and `ListForksResponse` returns a `paginationToken`, so callers can page through forks.

```ts
const { data } = await listForks('source-bucket', { limit: 50 });
// data.forks: { name: string; creationDate: Date }[]
// data.paginationToken?: string — pass back via options to fetch the next page
```
