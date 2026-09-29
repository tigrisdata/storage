---
"@tigrisdata/cli": patch
---

- Pressing Ctrl-C at a prompt prints `Operation cancelled` again. On Node 24 it printed `Error: readline was closed` and was reported as a crash.
- Usage lines now read the way a command is typed: `tigris <command> [options]` and `tigris access-keys create <name> [options]` rather than `tigris [options] [command]`.
- `tigris --help` opens with the CLI's name and version again (`Tigris CLI 3.13.0 — command line interface for Tigris`).
