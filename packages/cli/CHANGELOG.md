# @tigrisdata/cli

## 3.9.1

### Patch Changes

- [#259](https://github.com/tigrisdata/storage/pull/259) [`45e8661`](https://github.com/tigrisdata/storage/commit/45e866102b64e7fc6ae61475c39b49af6f662f1e) Thanks [@designcode](https://github.com/designcode)! - Fix `tigris init` failing the whole skills step over one unsupported editor, and
  the install banner appearing twice

  Two things went wrong in a single `npx tigris@latest init` run:

  - **Skills installed for nobody.** `init` passes every selected editor to the
    upstream `skills` installer in one call, and that tool validates all of its
    `-a` names before doing any work — so one name it doesn't know fails the step
    for every editor. A user with Zed selected got
    `Invalid agents: zed` and no skills at all, in any editor. Two changes: the
    installer is now pinned to `skills@latest`, since npx otherwise reuses a
    cached release that predates the newer agent names; and when the installer
    does reject an editor, `init` warns about that editor and installs for the
    rest instead of giving up.
  - **The banner printed mid-wizard.** The package's postinstall banner is written
    straight to `/dev/tty`, so it escaped the captured stdio of the `npm install
-g` that `init` and `tigris update` run and was painted over the wizard's own
    prompts. Children the CLI spawns to install or update itself now set
    `TIGRIS_NO_BANNER`, which postinstall honours — the banner still greets a
    first-time install.

## 3.9.0

### Minor Changes

- [#256](https://github.com/tigrisdata/storage/pull/256) [`91ee258`](https://github.com/tigrisdata/storage/commit/91ee258ed4c362cf6a01d20ee69d0f00231ecc4e) Thanks [@designcode](https://github.com/designcode)! - Add `tigris snapshots delete` to remove snapshots from a bucket

  Snapshots could be taken and listed, but never deleted from the CLI — the only
  way to drop one was to call the SDK's `deleteBucketSnapshot` directly. The new
  command closes that gap:

  ```sh
  tigris snapshots delete my-bucket 1765889000501544464 --yes
  tigris snapshots delete my-bucket 1765889000501544464,1765889000501544465 --yes
  ```

  - Takes the bucket name and one or more snapshot versions, comma-separated.
    Find versions with `tigris snapshots list`.
  - Prompts for confirmation before deleting; `--yes` (or `--force`) skips the
    prompt. Like the other destructive commands, it refuses to run without
    `--yes` when stdin is not a TTY.
  - Deletes each version in turn and reports per-version success or failure, so
    one bad version in a list does not hide the outcome of the others. Exits
    non-zero if any deletion failed.
  - `--format json` emits `{ action, bucket, versions, errors }`, matching the
    shape `buckets delete` already returns.

  Deletion is permanent. Forks already created from a snapshot are unaffected.

### Patch Changes

- [#246](https://github.com/tigrisdata/storage/pull/246) [`7702103`](https://github.com/tigrisdata/storage/commit/77021031b805b9632e3ba7a2877e71453db107cc) Thanks [@designcode](https://github.com/designcode)! - Fix object counts reported by `cp`, `mv`, and `rm`

  Folder markers (the zero-byte `folder/` keys that make an empty prefix show up
  as a folder) were being counted as objects, so `mv -r` on a folder of 10 files
  asked "Are you sure you want to move 11 object(s)?" and then reported "Moved 10
  object(s)". `ls` hides those markers, so the counts now do too — the
  confirmation prompt and the final tally are derived from the same rule and
  always agree.

  - `mv` and `rm` no longer count the folder's own marker, or the markers of any
    nested subfolders, as objects. The markers are still moved and deleted as
    before; they're just not counted or printed.
  - An operation whose scope is nothing but markers reports the folders it
    handled, so an empty folder counts as `1` rather than reading as a no-op, and
    clearing three sibling empty folders reports `3` rather than `1`.
  - `cp` remote-to-remote no longer counts nested folder markers, and a run whose
    object copies all failed now reports `0` instead of `No objects to copy`.

  The `count` field in `--format json` output for these commands follows the same
  rule and may be lower than before for folders that contain markers.

  Wildcards also no longer operate on the folder they match inside. A wildcard
  names files within a folder, not the folder itself, so:

  - `mv 'folder/*.zip'` with nothing matching now reports `No objects to move`
    instead of `Moved 1 object(s)`. It previously moved the source folder's
    marker to the destination, which removed `folder/` itself.
  - `cp 'folder/*'` no longer creates a folder marker at the destination.
  - `rm 'folder/*'` empties the folder without deleting it, matching how
    `rm dir/*` behaves in a shell. Use `rm -r folder` to remove the folder too.

## 3.8.0

### Minor Changes

- [#235](https://github.com/tigrisdata/storage/pull/235) [`f3f2135`](https://github.com/tigrisdata/storage/commit/f3f21351f44c5d2d58eb00b281b04554792fc5f9) Thanks [@designcode](https://github.com/designcode)! - Add PostHog usage analytics, reporting one `cli_command` event per invocation
  with the command name, its scrubbed arguments, flag names, CLI/OS/runtime
  versions, install method, and auth method. Signed-in runs are identified by
  account email so CLI activity joins the same person record as the console; runs
  with no session use a stable anonymous id that is linked to the account on the
  next `tigris login`.

  Credentials are never collected — access keys, secrets, tokens, passwords, and
  authorization headers are stripped whether they appear as a flag value or a
  positional argument, as are other people's email addresses. The machine hostname
  and working directory are never sent. Both telemetry surfaces now share a single
  scrubber (`src/utils/redact.ts`) so the guarantee cannot drift between usage
  analytics and error reports.

  Adds `tigris telemetry status | disable | enable` for a persistent opt-out, and
  prints a one-time disclosure notice on first use. The existing
  `TIGRIS_NO_TELEMETRY` and `DO_NOT_TRACK` environment variables now gate usage
  analytics as well as error reports, and are honored for any truthy value rather
  than only the literal `1` — `DO_NOT_TRACK=true` previously had no effect.

## 3.7.0

### Minor Changes

- [#230](https://github.com/tigrisdata/storage/pull/230) [`931178a`](https://github.com/tigrisdata/storage/commit/931178a4be74ac31054be0b90a97481caec8f671) Thanks [@designcode](https://github.com/designcode)! - `tigris init` no longer offers to install a CLI you already have, and the CLI is
  now reachable unscoped as `npx tigris`.

  - The wizard installs the CLI only when `tigris` isn't on PATH; when it is, the
    "Defaults" hint drops the `CLI - Global` step and the existing install is
    brought up to date instead. Updating delegates to `tigris update`, which
    matches how the CLI was installed (npm / Homebrew / standalone binary). If
    that fails and leaves a CLI too old to serve the agent handoff (predating
    `init --agent` in 3.5.0), the handoff falls back to `npx`.
  - Run through a package runner (`npx tigris init`, `pnpm dlx`), `init` no longer
    counts the runner's own throwaway copy as an installed CLI — that copy is gone
    the moment the runner exits, so it installs a real one instead.
  - `tigris init --agent` now opens with a single CLI step chosen from what `init`
    detected — install when `tigris` is missing, update when it's present —
    instead of printing both behind `if tigris isn't on $PATH` conditions for the
    agent to evaluate.
  - New `tigris` package: an unscoped alias that hands straight over to
    `@tigrisdata/cli`, so `npx tigris init` works without the scope. Every
    command, flag and exit code behaves identically.

- [#233](https://github.com/tigrisdata/storage/pull/233) [`8c25b57`](https://github.com/tigrisdata/storage/commit/8c25b5778b1079da3afd81063354aa248a73e135) Thanks [@designcode](https://github.com/designcode)! - `tigris buckets migrate` keeps more data in flight by default, and the budget is
  now tunable per run.

  - The in-flight byte budget — the total size of migrations scheduled
    server-side but not yet confirmed — rises from 10 GB to 50 GB. A run made up
    of multi-gigabyte objects can now keep several of them in flight at once
    instead of serializing files that individually exceeded the old budget.
  - New `--max-in-flight-gb` overrides that budget, accepting 1 to 100 (default
    50). Out-of-range and non-numeric values are rejected up front — before
    discovery lists the bucket — rather than silently clamped, so the flag always
    means what it says. The separate 1,000-object in-flight cap is unchanged.

## 3.6.1

### Patch Changes

- [#216](https://github.com/tigrisdata/storage/pull/216) [`3ace326`](https://github.com/tigrisdata/storage/commit/3ace326aab41891366f11f8cf8ae1a324709e6d3) Thanks [@designcode](https://github.com/designcode)! - `buckets migrate` now shows a live list of in-flight objects (name, size, time queued) instead of file/byte percentage bars. The gateway performs the migration server-side and exposes no per-object transfer progress, so a percentage computed against total bytes made a large in-flight file look like a stalled run — the per-file queued duration reflects what the CLI actually knows.

## 3.6.0

### Minor Changes

- [#204](https://github.com/tigrisdata/storage/pull/204) [`bb29d3a`](https://github.com/tigrisdata/storage/commit/bb29d3a6141ec232a322b6982d5bcab4e31304d6) Thanks [@designcode](https://github.com/designcode)! - Add `--default-tier` to `tigris buckets set` and `--snapshot-version` (alias `--snapshot`) to `tigris objects restore` / `tigris objects restore-info`.

- [#207](https://github.com/tigrisdata/storage/pull/207) [`f252179`](https://github.com/tigrisdata/storage/commit/f252179242f620f6f329324ee07c2798e3a14921) Thanks [@designcode](https://github.com/designcode)! - Add `TIGRIS_FORCE_PATH_STYLE` env var to force S3 path-style addressing (bucket in the URL path instead of the host), applied across every auth method. Useful behind gateways or proxies that don't support virtual-hosted-style requests. Also namespace the Auth0 env overrides (`AUTH0_DOMAIN`/`AUTH0_CLIENT_ID`/`AUTH0_AUDIENCE` → `TIGRIS_AUTH0_*`) for consistency with the other `TIGRIS_*` variables.

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
