---
'@tigrisdata/cli': patch
'tigris': patch
---

Usage analytics now record each command's outcome (success, exit code, duration, error category) and the first-touch surface on the person. Telemetry is sent by a background process after the command exits, so commands no longer wait on the network when they finish (previously up to ~300ms with error reporting on).
