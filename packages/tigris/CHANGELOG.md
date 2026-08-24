# tigris

## 3.9.1

### Patch Changes

- Updated dependencies [[`45e8661`](https://github.com/tigrisdata/storage/commit/45e866102b64e7fc6ae61475c39b49af6f662f1e)]:
  - @tigrisdata/cli@3.9.1

## 3.9.0

### Patch Changes

- Updated dependencies [[`7702103`](https://github.com/tigrisdata/storage/commit/77021031b805b9632e3ba7a2877e71453db107cc), [`91ee258`](https://github.com/tigrisdata/storage/commit/91ee258ed4c362cf6a01d20ee69d0f00231ecc4e)]:
  - @tigrisdata/cli@3.9.0

## 3.8.0

### Patch Changes

- Updated dependencies [[`f3f2135`](https://github.com/tigrisdata/storage/commit/f3f21351f44c5d2d58eb00b281b04554792fc5f9)]:
  - @tigrisdata/cli@3.8.0

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

### Patch Changes

- Updated dependencies [[`931178a`](https://github.com/tigrisdata/storage/commit/931178a4be74ac31054be0b90a97481caec8f671), [`8c25b57`](https://github.com/tigrisdata/storage/commit/8c25b5778b1079da3afd81063354aa248a73e135)]:
  - @tigrisdata/cli@3.7.0
