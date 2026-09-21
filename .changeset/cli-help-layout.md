---
"@tigrisdata/cli": minor
---

Cleaner, narrower help output, modelled on cobra-based CLIs such as flyctl and auth0.

- Commands and arguments in `specs.yaml` take a new optional `help_text`: a precise one-liner shown in help lists. The full `description` still appears on the command's own help page and in the generated docs.
- Command lists show the bare command name instead of `cp|copy [options] <src> <dest>`; aliases move to an `Aliases:` section and the usage line no longer advertises the hidden `help` subcommand.
- Long flags line up whether or not they have a short form, each section sizes its own column, an over-long flag sits on its own line instead of squeezing every description, and global flags are listed under `Global Options:`.
- Long command lists are split under headings: the root list (Get started, Unix-style commands, Manage resources, CLI), `buckets` and `objects`. Specs declare them with `groups` on the parent and `group` on each command.
- Headings, command names and flags are bold and the bracketed notes are dimmed on a colour terminal. Piped output and `NO_COLOR` stay plain.
- `--format` and `--json` are always listed together under `Global Options:`, including on the root page. `-y, --yes` is still accepted everywhere but, apart from the root page, is only listed by the commands that ask for confirmation.
- `--help` now shows allowed values, required flags and `Examples:`, and drops the `(default: false)` noise on plain flags.
- `tigris help` and `tigris <command> help` print the same page as `--help`. They previously used a separate renderer that never wrapped, emitting lines over 200 characters.
