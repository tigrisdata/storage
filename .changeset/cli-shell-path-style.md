---
'@tigrisdata/cli-shell': patch
---

Default to S3 path-style addressing (`TIGRIS_FORCE_PATH_STYLE=true`), as `@tigrisdata/agent-shell` does. In a browser, virtual-hosted URLs put each bucket on its own subdomain — a separate origin with its own CORS policy — so bucket-scoped commands such as `objects list` failed with CORS errors. Path style sends them to `<endpoint>/<bucket>/...` on the one origin. A caller's `env` still overrides it.
