# @tigrisdata/agent-kit

## 0.2.0

### Minor Changes

- [#281](https://github.com/tigrisdata/storage/pull/281) [`abf2574`](https://github.com/tigrisdata/storage/commit/abf2574d38a9a29096bbd2c96275fbccfe9c34d1) Thanks [@designcode](https://github.com/designcode)! - Add the `ReadWrite` access key role and centralize role types in `@tigrisdata/iam`.

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

### Patch Changes

- Updated dependencies [[`adf604a`](https://github.com/tigrisdata/storage/commit/adf604a15d82b4575aa6fb88c4ddf27a337d083f), [`abf2574`](https://github.com/tigrisdata/storage/commit/abf2574d38a9a29096bbd2c96275fbccfe9c34d1), [`5940199`](https://github.com/tigrisdata/storage/commit/594019979fd6efeede4399f7b69741179ef5d9c6), [`eb46ca8`](https://github.com/tigrisdata/storage/commit/eb46ca8431d52d58a3bbe91d46e75510d3711780)]:
  - @tigrisdata/storage@3.21.0
  - @tigrisdata/iam@2.5.0
