---
"@tigrisdata/cli-shell": patch
---

`tigris login` in the shell now signs in with OAuth directly instead of first asking whether to use OAuth or an access key. Pass `--access-key`/`--access-secret`, or run `tigris login credentials`, to sign in with an access key.
