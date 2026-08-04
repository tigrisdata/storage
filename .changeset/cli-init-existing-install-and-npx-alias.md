---
'@tigrisdata/cli': minor
'tigris': minor
---

`tigris init` no longer offers to install a CLI you already have, and the CLI is
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
