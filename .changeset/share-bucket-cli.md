---
'@tigrisdata/cli': minor
---

Add `tigris buckets share` and show shares in `tigris buckets get`.

```bash
tigris buckets share my-bucket --organization --role ReadOnly
tigris buckets share my-bucket --team tmid_MQQUhV --role Editor
tigris buckets share my-bucket --user uid_MQQUhV --role ReadOnly
tigris buckets share my-bucket --team tmid_A,tmid_B --role Editor,ReadOnly
tigris buckets share my-bucket --reset
```

`--organization` gives access to everyone in your organization and takes exactly
one `--role`. `--team` and `--user` accept comma-separated IDs; a single `--role`
applies to all of them, otherwise roles pair positionally.

Use one of `--organization`, `--team`, or `--user` per invocation. Because
shares merge by default, granting to more than one kind of target is just
running the command more than once.

Shares merge by default — a grant for a target you name is updated, and targets
you do not name keep their access. Pass `--override` to replace the list
outright, or `--reset` to remove every share.

`tigris buckets get` now shows a `Shared With` row listing the organization
grant first, then teams, then users.
