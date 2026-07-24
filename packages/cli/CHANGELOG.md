# @tigrisdata/cli

## 3.6.0

### Minor Changes

- [#204](https://github.com/tigrisdata/storage/pull/204) [`bb29d3a`](https://github.com/tigrisdata/storage/commit/bb29d3a6141ec232a322b6982d5bcab4e31304d6) Thanks [@designcode](https://github.com/designcode)! - Add `--default-tier` to `tigris buckets set` and `--snapshot-version` (alias `--snapshot`) to `tigris objects restore` / `tigris objects restore-info`.

### Patch Changes

- Updated dependencies [[`e44ef8a`](https://github.com/tigrisdata/storage/commit/e44ef8a784d32d9733196ae754b2fdd519552698), [`55a3b54`](https://github.com/tigrisdata/storage/commit/55a3b54ba9181d528c8a1c56ac52f002be296869)]:
  - @tigrisdata/iam@2.2.2
  - @tigrisdata/storage@3.18.0

## 3.5.0

### Minor Changes

- [#203](https://github.com/tigrisdata/storage/pull/203) [`fa9292c`](https://github.com/tigrisdata/storage/commit/fa9292c4518d0d2d6cabe32136bdf56105b9b089) Thanks [@designcode](https://github.com/designcode)! - Add `tigris init` to connect Tigris to AI coding agents. The interactive wizard
  detects installed editors, installs/updates the CLI, writes the Tigris remote
  MCP server config for 10 editors (Claude Code, Cursor, VS Code, Windsurf, Codex,
  Antigravity CLI, Cline, Zed, Roo Code, opencode), and installs the Tigris agent
  skills. `tigris init --agent` instead prints a plain-text setup recipe for a
  coding agent to run itself.

- [#200](https://github.com/tigrisdata/storage/pull/200) [`e64d887`](https://github.com/tigrisdata/storage/commit/e64d8871b29524530a1758e0ea94722fef039312) Thanks [@designcode](https://github.com/designcode)! - Add Sentry error telemetry to the CLI. Crashes (uncaught exceptions and
  unhandled rejections) are reported and flushed reliably; unexpected "general"
  and network errors on the handled path are captured best-effort. Events are
  enriched with the command, error category, exit code, CLI version, and platform.
  Secrets (access keys, tokens, credential flags) and the machine hostname are
  scrubbed before any event is sent. Telemetry is off in dev/test and when no DSN
  is configured, and can be disabled with `TIGRIS_NO_TELEMETRY=1` or the standard
  `DO_NOT_TRACK=1`.

### Patch Changes

- [#202](https://github.com/tigrisdata/storage/pull/202) [`af315f4`](https://github.com/tigrisdata/storage/commit/af315f4f360d9e9934b7dfb855637665b7b4eeba) Thanks [@designcode](https://github.com/designcode)! - Fix a deadlock in `tigris buckets migrate` that stalled large migrations, and
  overhaul how migrations are paced and displayed.

  - **Deadlock fix:** the drain step only polled the oldest in-flight objects, so
    a slow object at the head hid the completed objects behind it — their bytes
    were never freed, the in-flight budget stayed pinned at its cap, and the
    migration wedged (progress frozen with in-flight stuck at ~10 GB). It now
    polls a rotating window across the whole in-flight set, so completions are
    observed regardless of position.
  - **Smallest-first:** objects migrate smallest-first, so progress climbs quickly
    and large files finish at the end instead of stalling mid-run.
  - **In-flight caps:** in-flight work is bounded by both object count and total
    bytes, and the byte budget is enforced across the pending schedule batch, so a
    large file can't be scheduled alongside a full batch and blow the budget.
  - **Poll backoff:** the `isMigrated` poll backs off (5s up to 30s) after sweeps
    where nothing completed, and resets on the next completion, so an idle
    migration stops hammering the gateway with status checks.
  - **Multi-line, live progress:** progress renders as a sticky multi-line block —
    bucket and elapsed clock, file and byte percentages, and the file currently
    being pulled (name, size, and how long it has been going) plus the in-flight
    count. It redraws in place instead of duplicating lines on window resize, and
    truncates each line to the terminal width so nothing wraps. There is no
    throughput figure: confirmations are lumpy binary flips (the gateway does the
    transfer), not a byte stream, so an "obj/s · MB/s" rate would misrepresent
    progress.
  - **Responsive cancel:** Ctrl-C stops scheduling and polling and prints a
    summary of what was confirmed; objects already scheduled remain queued for
    migration server-side, so re-running resumes from there. It is felt
    immediately (the poll wait is abortable rather than blocking until it
    elapses), and a second Ctrl-C forces an immediate exit.

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
