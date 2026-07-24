---
"@tigrisdata/cli": minor
---

Add `TIGRIS_FORCE_PATH_STYLE` env var to force S3 path-style addressing (bucket in the URL path instead of the host), applied across every auth method. Useful behind gateways or proxies that don't support virtual-hosted-style requests. Also namespace the Auth0 env overrides (`AUTH0_DOMAIN`/`AUTH0_CLIENT_ID`/`AUTH0_AUDIENCE` → `TIGRIS_AUTH0_*`) for consistency with the other `TIGRIS_*` variables.
