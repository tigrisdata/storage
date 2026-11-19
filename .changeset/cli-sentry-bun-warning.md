---
"@tigrisdata/cli": patch
---

Stop the standalone binary from printing a Sentry "No diagnostics-channel injection detected" warning on every command. Telemetry now enables only the Sentry integrations error reporting needs, instead of every default minus a denylist.
