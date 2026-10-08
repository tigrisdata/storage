# @tigrisdata/agent-shell

## 0.7.2

### Patch Changes

- [#358](https://github.com/tigrisdata/storage/pull/358) [`f5808a6`](https://github.com/tigrisdata/storage/commit/f5808a674c0cbc4d86f28d31a0e5b0db6a61ef29) Thanks [@claude](https://github.com/apps/claude)! - Update the README to the current `fork` syntax: `fork [<source-bucket>] --name <fork-name> [--snapshot <version>]` creates a fork and `fork [<source-bucket>] --list` lists forks. The removed `forks` command and `createForksListCommand` export are no longer documented.
- Updated dependencies [[`198eaad`](https://github.com/tigrisdata/storage/commit/198eaadbb5ee006fe904d890bc5db13a8a7bf771)]:
  - @tigrisdata/storage@3.23.0

## 0.7.1

### Patch Changes

- [#185](https://github.com/tigrisdata/storage/pull/185) [`d6dead6`](https://github.com/tigrisdata/storage/commit/d6dead63f65d493729fec36f3391bb035a480769) Thanks [@designcode](https://github.com/designcode)! - Republish `@tigrisdata/agent-shell` from the Tigris monorepo. No API changes — the package now resolves `@tigrisdata/storage` via the workspace protocol and is released through Changesets instead of semantic-release.
