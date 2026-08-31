---
'@tigrisdata/iam': minor
'@tigrisdata/agent-kit': minor
'@tigrisdata/cli': minor
---

Add the `ReadWrite` access key role and centralize role types in `@tigrisdata/iam`.

`ReadWrite` grants object read and write on a bucket, sitting between `ReadOnly`
and `Editor`. It is accepted anywhere a bucket role is — `assignBucketRoles`,
`createAccessKey`, `tigris access-keys assign --role ReadWrite`, and the
`credentials.role` option on agent-kit's `createWorkspace` / `createForks`.

The role union previously lived as four inline string-literal types in `iam` plus
duplicated copies in `cli` and `agent-kit`, which had already drifted apart. It
now lives once in `packages/iam/src/lib/access-key/types.ts` and is exported from
the package root as `AccessKeyRole`, with `ACCESS_KEY_ROLES` for runtime
validation and `BucketRoleAssignment` for `{ bucket, role }` pairs. The shared
`AccessKey` and IAM list-response types moved to the same module.

This also fixes a type fidelity bug: `createAccessKey`'s `bucketsRole` option and
the raw IAM list response both excluded `NamespaceAdmin`, even though the API
accepts and returns it in that field.
