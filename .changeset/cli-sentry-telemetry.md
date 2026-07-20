---
"@tigrisdata/cli": minor
---

Add Sentry error telemetry to the CLI. Crashes (uncaught exceptions and
unhandled rejections) are reported and flushed reliably; unexpected "general"
and network errors on the handled path are captured best-effort. Events are
enriched with the command, error category, exit code, CLI version, and platform.
Secrets (access keys, tokens, credential flags) and the machine hostname are
scrubbed before any event is sent. Telemetry is off in dev/test and when no DSN
is configured, and can be disabled with `TIGRIS_NO_TELEMETRY=1` or the standard
`DO_NOT_TRACK=1`.
