---
'@tigrisdata/storage': minor
---

Support the `allowObjectAcl` and `enableDirectoryListing` options in `createBucket`.

- `allowObjectAcl: true` applies the object ACL setting via a follow-up `updateBucket` call once the bucket exists (the S3 `CreateBucket` command can't carry it). If the bucket is created but the ACL update fails — whether it returns an error or throws — the returned error makes the partial state explicit.
- `enableDirectoryListing: true` enables object listing for the bucket at creation time (relevant for public buckets). It defaults to `false` (listing disabled).

```ts
import { createBucket } from '@tigrisdata/storage';

await createBucket('my-bucket', { allowObjectAcl: true });
await createBucket('my-listable-bucket', {
  access: 'public',
  enableDirectoryListing: true,
});
```
