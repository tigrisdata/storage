---
'@tigrisdata/storage': minor
---

Add `restoreObject` and `getRestoreInfo` for working with archived objects.

- `restoreObject(path, options?)` restores an archived object (e.g. one in the `GLACIER` tier) back into an actively-readable copy for a number of `days` (defaults to `1`).
- `getRestoreInfo(path, options?)` reports an object's restore state from its `HEAD` headers as a `RestoreInfo` (`{ status, expiresAt? }`), using the `RestoreStatus` enum (`Archived`, `InProgress`, `Restored`). It resolves to `undefined` when there is no restore information — for a non-archived object or one that does not exist.

```ts
import { restoreObject, getRestoreInfo, RestoreStatus } from '@tigrisdata/storage';

await restoreObject('archived.bin', { days: 3 });

const { data } = await getRestoreInfo('archived.bin');
if (data?.status === RestoreStatus.InProgress) {
  // restore underway
}
```
