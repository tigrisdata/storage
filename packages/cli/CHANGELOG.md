# @tigrisdata/cli

## 3.4.1

### Patch Changes

- [#121](https://github.com/tigrisdata/cli/pull/121) [`8a901c1`](https://github.com/tigrisdata/cli/commit/8a901c19513699e2d43169db1e5590e7b1f2af87) Thanks [@designcode](https://github.com/designcode)! - Migrate the lint/format toolchain from ESLint and Prettier to Biome. Internal change with no impact on the published CLI behavior.

## 3.4.0

### Minor Changes

- [#122](https://github.com/tigrisdata/cli/pull/122) [`b034a1a`](https://github.com/tigrisdata/cli/commit/b034a1a9c96bc6fe404b07240467256aa839da82) Thanks [@designcode](https://github.com/designcode)! - Add `buckets rebase` and `buckets merge` commands for working with bucket forks. `rebase` advances a fork onto the latest state of its source bucket; `merge` merges a fork's changes back into its source, auto-resolving the parent (with `--into` to override and `--from-snapshot` to scope the merge).

### Patch Changes

- [#122](https://github.com/tigrisdata/cli/pull/122) [`b034a1a`](https://github.com/tigrisdata/cli/commit/b034a1a9c96bc6fe404b07240467256aa839da82) Thanks [@designcode](https://github.com/designcode)! - Fix `buckets create --enable-snapshots` not enabling snapshots. The flag is delivered camelCased (`enableSnapshots`) and was not being read by the create command, so buckets were created with snapshots left off.
