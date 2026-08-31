---
'@tigrisdata/storage': minor
---

Add `shareBucket()` and expose bucket shares on `getBucketInfo()`.

`shareBucket()` grants access to your whole organization, to specific teams, or
to specific users:

```ts
await shareBucket('my-bucket', {
  organization: { role: 'ReadOnly' },
  team: [{ teamId: 'tmid_MQQUhV', role: 'Editor' }],
  user: [{ userId: 'uid_MQQUhV', role: 'ReadOnly' }],
});
```

Shares **merge** by default: a target you name has its role updated, and targets
you do not name keep their access. Granting one team access therefore cannot
silently revoke your organization-wide grant. This costs a `getBucketInfo` call,
and a failure to read the current shares is surfaced rather than writing a
truncated list.

Pass `override: true` to make the shares you provide the complete list — anything
omitted loses access — and `{ override: true, team: [], user: [] }` to remove
every share. A call with no targets at all is rejected rather than treated as a
clear.

`getBucketInfo()` returns `settings.shares` in the same shape: `team` and `user`
are always arrays (empty when nothing is shared that way) and `organization` is
absent unless the bucket is shared org-wide.

Roles are `ReadOnly`, `ReadWrite`, or `Editor`, typed as `BucketShareRole`. The
org-wide `NamespaceAdmin` role is not accepted: a share always targets one
concrete bucket.
