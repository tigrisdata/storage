---
'@tigrisdata/cli': minor
---

Add PostHog usage analytics, reporting one `cli_command` event per invocation
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
