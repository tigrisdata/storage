---
"@tigrisdata/cli": patch
---

Error reporting moves to Sentry 11 with data collection kept exactly as restricted as before: no user info, headers, bodies, query strings or stack-frame locals, and the same redaction of everything that is sent. The reporter is now loaded only when telemetry is on, and in the background, so an opted-out install never loads it and a runtime it does not support gets a CLI without error reporting rather than a crash on startup. The CLI now declares Node.js 20.19 or later as its minimum.
