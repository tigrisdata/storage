# @tigrisdata/cli

## 3.4.3

### Patch Changes

- [#190](https://github.com/tigrisdata/storage/pull/190) [`7d5a12c`](https://github.com/tigrisdata/storage/commit/7d5a12c3e96715e7e3353452f62b550ad703805f) Thanks [@designcode](https://github.com/designcode)! - Fix the release pipeline so the standalone binaries and Homebrew formula are actually built and published. The `build-binaries` job installed dependencies but never built the workspace packages, so the binary `tsc` could not resolve `@tigrisdata/iam` / `@tigrisdata/storage` types and failed before any assets were uploaded (3.4.2 shipped to npm but without binaries).

## 3.4.2

### Patch Changes

- [#188](https://github.com/tigrisdata/storage/pull/188) [`693bcc8`](https://github.com/tigrisdata/storage/commit/693bcc86ce9b843141baa468dec0db70eb5a4745) Thanks [@designcode](https://github.com/designcode)! - Import the Tigris CLI into the storage monorepo and align its dev tooling with the workspace: drop the redundant `@types/node` dependency so pnpm resolves a single `@types/node` version across all packages (previously it pulled a second major, which broke `@tigrisdata/keyv-tigris`'s type-check).

## 3.4.1

### Patch Changes

- [#121](https://github.com/tigrisdata/cli/pull/121) [`8a901c1`](https://github.com/tigrisdata/cli/commit/8a901c19513699e2d43169db1e5590e7b1f2af87) Thanks [@designcode](https://github.com/designcode)! - Migrate the lint/format toolchain from ESLint and Prettier to Biome. Internal change with no impact on the published CLI behavior.

## 3.4.0

### Minor Changes

- [#122](https://github.com/tigrisdata/cli/pull/122) [`b034a1a`](https://github.com/tigrisdata/cli/commit/b034a1a9c96bc6fe404b07240467256aa839da82) Thanks [@designcode](https://github.com/designcode)! - Add `buckets rebase` and `buckets merge` commands for working with bucket forks. `rebase` advances a fork onto the latest state of its source bucket; `merge` merges a fork's changes back into its source, auto-resolving the parent (with `--into` to override and `--from-snapshot` to scope the merge).

### Patch Changes

- [#122](https://github.com/tigrisdata/cli/pull/122) [`b034a1a`](https://github.com/tigrisdata/cli/commit/b034a1a9c96bc6fe404b07240467256aa839da82) Thanks [@designcode](https://github.com/designcode)! - Fix `buckets create --enable-snapshots` not enabling snapshots. The flag is delivered camelCased (`enableSnapshots`) and was not being read by the create command, so buckets were created with snapshots left off.
