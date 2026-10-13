---
"@tigrisdata/cli": minor
---

`tigris access-keys create --default-permissions disable` creates a key without the default permissions — it can do only what its roles and policies explicitly allow — and `tigris access-keys set <id> --default-permissions enable|disable` changes the setting on an existing key, leaving its bucket roles as they are. This is the console's "Enable default permissions" toggle; JSON output carries it as the SDK's `scope` (`standard` or `no_default_allow`). `access-keys get` and `access-keys list` show the setting for every key.
